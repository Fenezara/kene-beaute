"use client";
// Kènè Pro — Paramètres (t. 69-c) : compte, affichage, langue, session.
// Sobriété back-office : volontairement PAS d'accès à l'espace cliente ici
// (isolation t. 69-a — l'app pro vit sur un compte dédié, fermer la session
// ramène simplement à l'accueil Kènè via le clamp du store, jamais setSpace).
// Hydratation : l'état actif Clair/Sombre est gardé par useSyncExternalStore
// (pattern ThemeToggle / use-install) — zéro setState-in-effect, zéro flash.
import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Building2, Check, ChevronRight, Crown, Languages, LogOut, Moon, Phone, SunMedium } from "lucide-react";
import { toast } from "sonner";
import { LANGS, type Lang } from "@/lib/kene/i18n";
import { useT } from "@/lib/kene/use-t";
import { Badge } from "@/components/ui/badge";
import { Eyebrow, IconBadge } from "@/components/kene/ui2026";
import { useKene } from "@/store/kene";
import { InitialAvatar, SectionHeader } from "./ui-bits";
import type { ProSectionId } from "./ProApp";

/* Porte d'hydratation : false pendant le rendu serveur + l'hydratation, true
 * ensuite — l'état actif Clair/Sombre ne s'affiche qu'une fois le thème
 * réellement lisible (règle react-hooks/set-state-in-effect : pas de setState
 * dans un effet, même approche que ThemeToggle et use-install). */
const subscribeNothing = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNothing, () => true, () => false);
}

export function SettingsSection({ tenantName, tenantCity, onNavigate }: { tenantId: string; tenantName: string; tenantCity?: string; onNavigate?: (s: ProSectionId) => void }) {
  const sessionUser = useKene((s) => s.user);
  const setUser = useKene((s) => s.setUser);
  const clearCart = useKene((s) => s.clearCart);
  const { lang, setLang } = useT();

  // ── Affichage (next-themes — attribute="class", light/dark uniquement) ──
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();
  // Défaut coché « Clair » si indéfini (avant hydratation ou thème non posé).
  const activeTheme = hydrated ? (theme === "dark" ? "dark" : "light") : "light";

  // L'isolation 69-a garantit une session de rôle « pro » dans cet espace —
  // repli défensif si la session venait à être purgée entre deux rendus.
  const managerName = sessionUser?.name?.trim() || "Gérante";
  const managerPhone = sessionUser?.phone || "Numéro non renseigné";

  /** Langue de l'interface — même logique que côté cliente. */
  function selectLang(l: Lang) {
    if (l === lang) return;
    setLang(l);
    const label = LANGS.find((x) => x.id === l)?.label ?? "";
    toast.success(`Interface en ${label.toLowerCase()}`);
  }

  /** Ferme la session : le clamp du store ramène à l'accueil cliente
   *  (setUser(null) → espace "client" sans session → onboarding). La session
   *  SERVEUR (cookie httpOnly signé, t. 71-b) est fermée dans la foulée. */
  function closeSession() {
    void fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    clearCart();
    setUser(null);
    toast.info("Session fermée");
  }

  return (
    <div className="max-w-2xl space-y-4">
      <SectionHeader
        title="Paramètres"
        sub="Compte, affichage et session de l'espace entreprise"
        actions={
          <Badge variant="outline" className="bg-gold/15 text-gold-text border-transparent">Espace entreprise</Badge>
        }
      />

      {/* Compte — gérante de session + institut actif */}
      <div className="k-card rounded-[20px] p-4">
        <div className="flex items-center gap-3.5">
          <InitialAvatar name={managerName} className="size-12 text-[13px]" />
          <div className="min-w-0 flex-1">
            <p className="font-heading text-[15px] font-bold truncate">{managerName}</p>
            <Eyebrow className="mt-0.5">Fondatrice / Gérante</Eyebrow>
          </div>
        </div>
        <div className="mt-3.5 grid gap-2 sm:grid-cols-2">
          <p className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 min-h-10 text-xs text-muted-foreground">
            <Phone size={13} className="shrink-0 text-gold-text" aria-hidden="true" />
            <span className="truncate font-mono">{managerPhone}</span>
          </p>
          <p className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 min-h-10 text-xs text-muted-foreground">
            <Building2 size={13} className="shrink-0 text-gold-text" aria-hidden="true" />
            <span className="truncate">{tenantName}{tenantCity ? ` · ${tenantCity}` : ""}</span>
          </p>
        </div>
      </div>

      {/* Affichage — Clair/Sombre (mêmes boutons que l'app cliente, cohérence) */}
      <div className="k-card rounded-[20px] p-4">
        <div className="flex items-center gap-3">
          <IconBadge icon={<SunMedium size={18} />} tone="gold" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold">Affichage</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">Clair de jour, sombre le soir — appliqué aussitôt à tout Kènè.</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => setTheme("light")}
            aria-pressed={activeTheme === "light"}
            className={`h-11 rounded-[14px] inline-flex items-center justify-center gap-2 text-xs font-bold active:scale-[0.98] transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${activeTheme === "light" ? "k-btn-gold text-primary-foreground" : "k-chip"}`}
          >
            <SunMedium size={16} /> Clair {activeTheme === "light" && <Check size={14} aria-hidden="true" />}
          </button>
          <button
            onClick={() => setTheme("dark")}
            aria-pressed={activeTheme === "dark"}
            className={`h-11 rounded-[14px] inline-flex items-center justify-center gap-2 text-xs font-bold active:scale-[0.98] transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${activeTheme === "dark" ? "k-btn-gold text-primary-foreground" : "k-chip"}`}
          >
            <Moon size={16} /> Sombre {activeTheme === "dark" && <Check size={14} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* Langue — grid compact, même logique selectLang que l'app cliente */}
      <div className="k-card rounded-[20px] p-4">
        <div className="flex items-center gap-3">
          <IconBadge icon={<Languages size={18} />} tone="gold" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold">Langue de l&apos;interface</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">Textes des écrans — le reste de l&apos;interface reste en français.</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {LANGS.map((l) => {
            const active = lang === l.id;
            return (
              <button
                key={l.id}
                onClick={() => selectLang(l.id)}
                aria-pressed={active}
                className={`k-chip rounded-[14px] border p-2.5 min-h-11 text-left active:scale-[0.98] transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  active ? "border-primary bg-primary/10" : "hover:border-primary/40"
                }`}
              >
                <span className="flex items-center justify-between gap-1.5">
                  <span className={`text-xs font-bold ${active ? "text-primary" : "text-foreground"}`}>{l.label}</span>
                  {active ? (
                    <Check size={13} className="text-primary shrink-0" aria-hidden="true" />
                  ) : (
                    <span className="text-[9px] font-mono font-bold text-muted-foreground/70" aria-hidden="true">{l.flag}</span>
                  )}
                </span>
                <span className="block text-[10px] text-muted-foreground mt-0.5">{l.note}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Abonnement & facturation (t. 71-c) — lien vers la section dédiée
          (même pattern de navigation que les autres sections). */}
      <div className="k-card rounded-[20px] p-2">
        <button
          onClick={() => onNavigate?.("abonnement")}
          className="w-full flex items-center gap-3 rounded-[14px] p-2.5 text-left active:scale-[0.99] transition-transform focus-visible:outline-2 focus-visible:outline-primary"
        >
          <IconBadge icon={<Crown size={18} />} tone="gold" />
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-bold">Abonnement &amp; facturation</span>
            <span className="block text-[11px] text-muted-foreground mt-0.5">Offres Essentiel / Complexe · facturation en mode essai</span>
          </span>
          <ChevronRight size={16} className="text-muted-foreground shrink-0" aria-hidden="true" />
        </button>
      </div>

      {/* Session — destructif sobre (jamais de setSpace : le clamp store
          ramène à l'accueil cliente, isolation t. 69-a) */}
      <div className="k-card rounded-[20px] p-4">
        <div className="flex items-center gap-3">
          <IconBadge icon={<LogOut size={18} />} tone="bissap" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold">Session</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">Ferme la session de cet appareil — tu te reconnecteras avec ton numéro gérante.</p>
          </div>
        </div>
        <button
          onClick={closeSession}
          className="mt-3 h-11 w-full rounded-xl border border-destructive/40 bg-destructive/10 text-destructive text-sm font-bold inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-transform focus-visible:outline-2 focus-visible:outline-destructive"
        >
          <LogOut size={15} /> Fermer la session
        </button>
      </div>

      {/* À propos */}
      <div className="k-card rounded-[20px] p-4">
        <p className="font-heading font-bold text-sm">Kènè Pro — v1.0</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
          Paiements en mode essai · conformité CNPS CI / IPM SN / SYSCOHADA. Réservations, commandes et ventes de l&apos;institut arrivent en temps réel lorsque le service de notifications est en ligne.
        </p>
      </div>
    </div>
  );
}
