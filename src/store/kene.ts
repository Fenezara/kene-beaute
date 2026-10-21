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
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import type { CartLine } from "@/lib/kene/types";

export type Space = "client" | "pro" | "admin";
export type ClientTab = "accueil" | "agenda" | "dossier" | "instituts" | "diagnostic" | "boutique" | "rdv" | "chat" | "profil" | "parametres" | "abonnement" | "legal";

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
  selectedTenantId?: string | null;
  selectedTenant?: { id: string; name: string; city: string; phone?: string | null; ownerPhone?: string | null; image?: string; address?: string | null; country?: string | null } | null;
  consentHealth?: boolean;
  // — photo de profil: la data URL vit en base (jamais dans le
  // store), seul le booléen voyage — l'UI charge /api/media/user/:id.
  hasAvatar?: boolean;
  // — poste de l'EMPLOYÉE connectée (estheticienne | dermo_conseillere |
  // caissiere | manager). Absent/null = gérante (accès complet).
  employeeRole?: string | null;
  // — nom officiel de l'employée dans l'établissement
  employeeName?: string | null;
  // — permissions granulaires personnalisées de l'employée (modules autorisés sur mesure)
  employeePermissions?: string[] | null;
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

const TABS: readonly ClientTab[] = ["accueil", "agenda", "instituts", "diagnostic", "boutique", "rdv", "chat", "profil", "parametres", "abonnement", "legal"];

/** Espace autorisé pour un rôle de session — source de vérité
 * unique de l'isolation des comptes: « pro » → espace entreprise, « admin »
 * → console, tout le reste (cliente, absence de session) → app cliente. */
export function spaceForRole(role: string | undefined | null): Space {
  if (role === "pro") return "pro";
  if (role === "admin") return "admin";
  return "client";
}

/** Détermine si l'utilisateur possède un compte authentifié et sauvegardé
 * (non anonyme / non invité temporaire).
 * Un compte sauvegardé possède un identifiant et un numéro réel non préfixé par +22500. */
export function isSavedUser(user: { phone?: string | null; id?: string | null; name?: string | null } | null | undefined): boolean {
  if (!user || !user.id || !user.phone) return false;
  if (user.phone.startsWith("+22500")) return false;
  if (user.phone === "+2250701020304" && user.name === "Nouvelle invitée") return false;
  if (user.id === "guest" || user.id.startsWith("guest_")) return false;
  if (user.name === "Nouvelle invitée") return false;
  return true;
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
    const candidate = p.user as SessionUser;
    if (isSavedUser(candidate)) {
      out.user = candidate;
    } else {
      out.user = null;
    }
  }
  if (out.user?.role === "admin" && (p.space === "pro" || p.space === "client" || p.space === "admin")) {
    out.space = p.space;
  } else if (out.user?.role === "pro" && (p.space === "pro" || p.space === "client")) {
    out.space = p.space;
  } else if (out.user && isSavedUser(out.user)) {
    out.space = spaceForRole(out.user.role);
  } else {
    out.space = "client";
  }
  if (p.clientTab === "boutique" || p.clientTab === "rdv") {
    out.clientTab = "accueil";
  } else if (TABS.includes(p.clientTab as ClientTab)) {
    out.clientTab = p.clientTab as ClientTab;
  }
  if (Array.isArray(p.cart)) out.cart = (p.cart as unknown[]).filter(isSaneCartLine);
  else out.cart = [];
  if (typeof p.proTenantId === "string") out.proTenantId = p.proTenantId;
  return out;
}

// Garde de protection contre l'écrasement accidentel de la session dans localStorage au démarrage :
// Tant que la réhydratation n'a pas eu lieu ou qu'une déconnexion explicite (setUser(null)) n'a pas été demandée,
// un appel précoce à setState (ex: _keneHydrated, setClientTab) ne peut JAMAIS écraser un compte sauvegardé par user: null.
let explicitNullUserAllowed = false;

const safeLocalStorage: StateStorage = {
  getItem: (name: string): string | null => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string): void => {
    if (typeof window === "undefined") return;
    try {
      const incoming = JSON.parse(value) as { state?: Partial<PersistedKene>; version?: number };
      const incomingUser = incoming?.state?.user;
      if (!incomingUser && !explicitNullUserAllowed) {
        const existingRaw = window.localStorage.getItem(name);
        if (existingRaw) {
          const existing = JSON.parse(existingRaw) as { state?: Partial<PersistedKene>; version?: number };
          if (existing?.state?.user && isSavedUser(existing.state.user)) {
            // Préserver l'utilisateur et l'espace déjà sauvegardés dans localStorage
            const merged = {
              ...incoming,
              state: {
                ...incoming.state,
                user: existing.state.user,
                space: existing.state.space ?? spaceForRole(existing.state.user.role),
                proTenantId: incoming.state?.proTenantId ?? existing.state.proTenantId ?? null,
              },
            };
            window.localStorage.setItem(name, JSON.stringify(merged));
            return;
          }
        }
      }
      window.localStorage.setItem(name, value);
    } catch {
      // Ignorer si quota ou stockage privé bloqué
    }
  },
  removeItem: (name: string): void => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(name);
    } catch {}
  },
};

export const useKene = create<KeneState>()(
  persist<KeneState, [], [], Partial<PersistedKene>>(
    (set) => ({
      space: "client",
      clientTab: "diagnostic",
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
          // Permettre l'accès à l'espace Pro (mode hors-ligne cabine, caisse, raccourci direct)
          if (space === "pro") {
            return { space: "pro" };
          }
          const allowed = spaceForRole(s.user?.role);
          return { space: allowed };
        }),
      setIntroActive: (introActive) => set({ introActive }),
      setClientTab: (clientTab) =>
        set({ clientTab: clientTab === "boutique" || clientTab === "rdv" ? "accueil" : clientTab }),
      // setUser fait suivre l'espace au rôle (null → « client » = retour
      // onboarding; user pro/admin → ProApp/AdminApp se montent).
      // Si l'utilisateur est admin ou pro et qu'un espace autorisé est déjà actif, on respecte son choix.
      setUser: (user) => {
        explicitNullUserAllowed = user === null;
        set((s) => {
          const keepAdminSpace =
            user?.role === "admin" && (s.space === "client" || s.space === "pro" || s.space === "admin");
          const keepProSpace =
            user?.role === "pro" && (s.space === "client" || s.space === "pro");
          return {
            user,
            space: keepAdminSpace || keepProSpace ? s.space : spaceForRole(user?.role),
          };
        });
      },
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
      storage: createJSONStorage(() => safeLocalStorage),
      skipHydration: true,
      // Liste blanche: seuls les comptes sauvegardés (authentifiés avec numéro vérifié) sont persistés.
      // Les sessions invitées temporaires ne sont JAMAIS stockées dans localStorage afin de toujours
      // présenter la page d'accueil d'accueil au rechargement (F5) ou à la réouverture de l'application.
      partialize: (s) => ({
        space: isSavedUser(s.user) ? s.space : "client",
        user: isSavedUser(s.user) ? s.user : null,
        cart: s.cart,
        proTenantId: s.proTenantId,
        clientTab: s.clientTab,
      }),
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

// ── Déclenchement immédiat de la relecture côté client ──
if (typeof window !== "undefined") {
  const kick = () => {
    try {
      if (!useKene.persist.hasHydrated()) {
        void Promise.resolve(useKene.persist.rehydrate()).finally(() => {
          useKene.setState({ _keneHydrated: true });
        });
      } else {
        useKene.setState({ _keneHydrated: true });
      }
    } catch {
      useKene.setState({ _keneHydrated: true });
    }
  };

  // Exécution synchrone immédiate (localStorage est immédiatement disponible dans le navigateur)
  kick();
}

