"use client";
// Kènè — store global (espaces, session, panier)
// ISOLATION DES COMPTES: l'espace actif est DÉRIVÉ du rôle de la
// session — un compte pro n'accède qu'à l'espace Pro, un compte admin qu'à la
// console Admin, une cliente qu'à l'app cliente. Plus de bascule libre (le
// SpaceSwitcher d'origine a été supprimé): setSpace n'accepte une valeur QUE
// si elle correspond au rôle du user courant, setUser fait suivre l'espace au
// rôle, et sanitizePersisted répare les vieilles sessions persistées dont
// l'espace serait incohérent avec le rôle (ex: cliente dans l'espace pro).
// Robustesse persistance:
// • skipHydration: le rendu serveur ET l'hydratation React passent sur
// l'état initial; le localStorage est relu APRÈS le premier rendu client
// (déclenchement post-« load » ci-dessous + rehydrate du shell applicatif,
// idempotent) — zéro mismatch d'hydratation (pattern lang.ts / use-t.ts).
// • version 1 + migrate: les données d'une vieille session sont validées
// champ par champ — shape invalide → valeur initiale; une ligne de panier
// corrompue (qty/price non finis) est filtrée, jamais affichée.
// • _keneHydrated: passe à true quand la relecture est terminée (jamais
// persisté — le partialize est une liste blanche).
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartLine } from "@/lib/kene/types";

export type Space = "client" | "pro" | "admin";
export type ClientTab = "accueil" | "diagnostic" | "boutique" | "rdv" | "chat" | "profil" | "parametres" | "abonnement" | "legal";

export interface SessionUser {
  id: string;
  phone: string;
  name: string;
  role: string;
  city?: string | null;
  district?: string | null;
  birthDate?: string | null;
  pregnant?: boolean | null;
  preferredChannel?: string | null;
  beautyBudget?: string | null;
  skinType?: string | null;
  fitzpatrick?: string | null;
  allergies?: string | null;
  consentHealth?: boolean;
  // — photo de profil: la data URL vit en base (jamais dans le
  // store), seul le booléen voyage — l'UI charge /api/media/user/:id.
  hasAvatar?: boolean;
  // — poste de l'EMPLOYÉE connectée (estheticienne | dermo_conseillere |
  // caissiere | manager). Absent/null = gérante (accès complet).
  employeeRole?: string | null;
  // — établissement rattaché pour l'employée / pro
  tenantId?: string | null;
  // — code PIN secret défini (permet la reconnexion instantanée sans SMS)
  hasPin?: boolean;
}

/** Shape réellement persistée (liste blanche du partialize). */
interface PersistedKene {
  space: Space;
  clientTab: ClientTab;
  user: SessionUser | null;
  cart: CartLine[];
  proTenantId: string | null;
}

interface KeneState extends PersistedKene {
  introActive: boolean; // introduction immersive en cours (non persisté)
 /** true une fois le localStorage relu (fin de rehydrate) — non persisté.
 * Les consommateurs lisent false tant que la relecture n'a pas eu lieu. */
  _keneHydrated: boolean;
  setSpace: (s: Space) => void;
  setIntroActive: (b: boolean) => void;
  setClientTab: (t: ClientTab) => void;
  setUser: (u: SessionUser | null) => void;
  addToCart: (line: CartLine) => void;
  setCartQty: (productId: string, qty: number) => void;
  clearCart: () => void;
  setProTenantId: (id: string | null) => void;
}

const TABS: readonly ClientTab[] = ["accueil", "diagnostic", "boutique", "rdv", "chat", "profil", "parametres", "abonnement", "legal"];

/** Espace autorisé pour un rôle de session — source de vérité
 * unique de l'isolation des comptes: « pro » → espace entreprise, « admin »
 * → console, tout le reste (cliente, absence de session) → app cliente. */
export function spaceForRole(role: string | undefined | null): Space {
  if (role === "pro") return "pro";
  if (role === "admin") return "admin";
  return "client";
}

/** Ligne de panier saine: identifiants string, qty/price finis et cohérents. */
function isSaneCartLine(l: unknown): l is CartLine {
  if (!l || typeof l !== "object") return false;
  const c = l as { productId?: unknown; name?: unknown; price?: unknown; qty?: unknown; image?: unknown };
  return (
    typeof c.productId === "string" && c.productId.length > 0 &&
    typeof c.name === "string" && c.name.length > 0 &&
    typeof c.image === "string" &&
    typeof c.price === "number" && Number.isFinite(c.price) && c.price >= 0 &&
    typeof c.qty === "number" && Number.isFinite(c.qty) && c.qty > 0
  );
}

/** Valide un état persisté douteux → merge minimal sûr. Champ invalide ou
 * absent → absent du résultat (la valeur initiale reste en place après le
 * merge); panier corrompu → lignes invalides filtrées. */
function sanitizePersisted(raw: unknown): Partial<PersistedKene> {
  const p = (raw ?? {}) as Record<string, unknown>;
  const out: Partial<PersistedKene> = {};
  // Session d'ABORD — l'espace en est dérivé juste après: l'ordre
  // importe, un user pro réveillé ne doit jamais atterrir dans l'espace cliente.
  if (p.user === null) out.user = null;
  else if (p.user && typeof p.user === "object" && typeof (p.user as { id?: unknown }).id === "string" && typeof (p.user as { phone?: unknown }).phone === "string") {
    out.user = p.user as SessionUser;
  }
  if (out.user?.role === "admin" && (p.space === "pro" || p.space === "client" || p.space === "admin")) {
    out.space = p.space;
  } else if (out.user?.role === "pro" && (p.space === "pro" || p.space === "client")) {
    out.space = p.space;
  } else {
    out.space = out.user ? spaceForRole(out.user.role) : "client";
  }
  if (TABS.includes(p.clientTab as ClientTab)) out.clientTab = p.clientTab as ClientTab;
  if (Array.isArray(p.cart)) out.cart = (p.cart as unknown[]).filter(isSaneCartLine);
  else out.cart = [];
  if (typeof p.proTenantId === "string") out.proTenantId = p.proTenantId;
  return out;
}

export const useKene = create<KeneState>()(
  persist<KeneState, [], [], Partial<PersistedKene>>(
    (set) => ({
      space: "client",
      clientTab: "accueil",
      user: null,
      cart: [],
      proTenantId: null,
      introActive: false,
      _keneHydrated: false,
      setSpace: (space) =>
        set((s) => {
          // L'administrateur a accès à tous les espaces
          if (s.user?.role === "admin") {
            return { space };
          }
          // Les utilisateurs Pro (gérants et employés d'institut) ont accès à leur espace Pro ET à leur espace personnel Client
          if (s.user?.role === "pro") {
            if (space === "pro" || space === "client") {
              return { space };
            }
          }
          const allowed = spaceForRole(s.user?.role);
          return { space: allowed };
        }),
      setIntroActive: (introActive) => set({ introActive }),
      setClientTab: (clientTab) => set({ clientTab }),
      // setUser fait suivre l'espace au rôle (null → « client » = retour
      // onboarding; user pro/admin → ProApp/AdminApp se montent).
      // Si l'utilisateur est admin ou pro et qu'un espace autorisé est déjà actif, on respecte son choix.
      setUser: (user) =>
        set((s) => {
          const keepAdminSpace =
            user?.role === "admin" && (s.space === "client" || s.space === "pro" || s.space === "admin");
          const keepProSpace =
            user?.role === "pro" && (s.space === "client" || s.space === "pro");
          return {
            user,
            space: keepAdminSpace || keepProSpace ? s.space : spaceForRole(user?.role),
          };
        }),
      addToCart: (line) =>
        set((s) => {
          const existing = s.cart.find((l) => l.productId === line.productId);
          if (existing) {
            return {
              cart: s.cart.map((l) =>
                l.productId === line.productId ? { ...l, qty: l.qty + line.qty } : l
              ),
            };
          }
          return { cart: [...s.cart, line] };
        }),
      setCartQty: (productId, qty) =>
        set((s) => ({
          cart: qty <= 0 ? s.cart.filter((l) => l.productId !== productId) : s.cart.map((l) => (l.productId === productId ? { ...l, qty } : l)),
        })),
      clearCart: () => set({ cart: [] }),
      setProTenantId: (proTenantId) => set({ proTenantId }),
    }),
    {
      name: "kene-store",
      version: 1,
      skipHydration: true,
      // Liste blanche: _keneHydrated / introActive / actions ne sortent jamais.
      partialize: (s) => ({ space: s.space, user: s.user, cart: s.cart, proTenantId: s.proTenantId, clientTab: s.clientTab }),
      // Merge minimal ET sûr: zustand n'appelle migrate que si le storage
      // porte un numéro de version ≠ 1 — les vieilles sessions SANS champ
      // version arrivent ici brutes. On assainit donc dans le merge aussi:
      // shape invalide → champ absent → valeur initiale; panier corrompu
      // (qty/price non finis ou null) → lignes invalides filtrées; espace
      // incohérent avec le rôle de session → re-clamppé (isolation).
      merge: (persisted, current) => ({ ...current, ...sanitizePersisted(persisted) }),
      // Versions numérotées futures (0 ≠ 1 déclenché par zustand uniquement
      // si le storage porte un version): même assainissement, passthrough sûr.
      migrate: (persisted) => sanitizePersisted(persisted),
      // _keneHydrated ← true à la fin de la relecture (réussie ou non: un
      // localStorage corrompu ne doit jamais bloquer l'application).
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn("[kene-store] relecture localStorage impossible :", error);
        useKene.setState({ _keneHydrated: true });
      },
    }
  )
);

// ── Déclenchement de la relecture (une seule fois, après le premier rendu) ──
// Le shell applicatif appelle useKene.persist.rehydrate dès son premier montage.
// Ce filet assure la relecture au plus vite dès l'interactivité du DOM.
if (typeof window !== "undefined") {
  const kick = () => {
    if (!useKene.persist.hasHydrated()) void useKene.persist.rehydrate();
  };
  if (document.readyState === "complete" || document.readyState === "interactive") {
    queueMicrotask(kick);
  } else {
    document.addEventListener("DOMContentLoaded", kick, { once: true });
    window.addEventListener("load", kick, { once: true });
  }
}
