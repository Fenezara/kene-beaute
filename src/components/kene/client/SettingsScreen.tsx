"use client";
// Kènè Cliente — Paramètres (t. 69-c) : l'écran de réglages standard façon
// applis 2026 (TikTok / Instagram) — compte, apparence, langue, notifications,
// sécurité, confidentialité, application, espace entreprise, session.
// Les sections « réglages » vivaient dans ProfileScreen (langue, consentement,
// RGPD, 2FA, PWA, espace entreprise, déconnexion) : elles ont été DÉPLACÉES ici
// avec un code métier identique (imports adaptés uniquement). Le Profil garde
// l'identité, le profil peau, le wallet et le parrainage.
// Hydratation : la permission navigateur et l'état « monté » du thème sont lus
// via useSyncExternalStore (pattern use-install.ts) — aucune API web n'est
// touchée pendant le rendu, zéro setState-in-effect, zéro mismatch.

import { useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import {
  ArrowLeft, Bell, Building2, Check, ChevronRight, Crown, Download, Languages, Loader2, LogOut, MapPin,
  Moon, Pencil, Phone, Scale, ShieldCheck, Smartphone, SunMedium,
} from "lucide-react";
import { toast } from "sonner";
import { LANGS, type Lang } from "@/lib/kene/i18n";
import { useT } from "@/lib/kene/use-t";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { IconBadge, Reveal, RevealItem } from "@/components/kene/ui2026";
import { useKene, type ClientTab, type SessionUser } from "@/store/kene";
import { useSecurity } from "@/store/security";
import { useInstallPrompt } from "@/components/kene/pwa/use-install";

/* ─── Porte d'hydratation (thème) ───
 * false pendant le rendu serveur + l'hydratation, true ensuite : l'état actif
 * Clair/Sombre ne s'affiche qu'une fois le thème réellement lisible — aucun
 * flash, aucun mismatch. useSyncExternalStore (règle react-hooks/set-state-in-effect
 * oblige — même approche que ThemeToggle/use-install). */
const subscribeNothing = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNothing, () => true, () => false);
}

/* ─── Permission notifications du navigateur (état système externe) ───
 * La permission n'est lue qu'après l'hydratation (getServerSnapshot →
 * "unsupported" → carte masquée tant que l'API n'est pas confirmée côté
 * client, y pendant l'hydratation). La permission peut changer hors de
 * l'application (réglages du navigateur, autre onglet) → relecture sur
 * focus/visibilité ; notifyPermListeners() force la relecture juste après
 * Notification.requestPermission(). */
type NotifPerm = "unsupported" | "default" | "granted" | "denied";

const permListeners = new Set<() => void>();
function notifyPermListeners(): void {
  permListeners.forEach((l) => l());
}

function subscribePerm(cb: () => void): () => void {
  permListeners.add(cb);
  window.addEventListener("focus", cb);
  document.addEventListener("visibilitychange", cb);
  return () => {
    permListeners.delete(cb);
    window.removeEventListener("focus", cb);
    document.removeEventListener("visibilitychange", cb);
  };
}

function readPerm(): NotifPerm {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

function serverPerm(): NotifPerm {
  return "unsupported";
}

export function SettingsScreen() {
  const user = useKene((s) => s.user) as SessionUser;
  const setUser = useKene((s) => s.setUser);
  const setClientTab = useKene((s) => s.setClientTab);
  const clearCart = useKene((s) => s.clearCart);
  const { t, lang, setLang } = useT();

  // ── Apparence (next-themes — attribute="class", light/dark uniquement) ──
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();
  // Défaut coché « Clair » si indéfini (avant hydratation ou thème non posé).
  const activeTheme = hydrated ? (theme === "dark" ? "dark" : "light") : "light";

  // ── Permission notifications ──
  const notifPerm = useSyncExternalStore(subscribePerm, readPerm, serverPerm);

  const [exportBusy, setExportBusy] = useState(false);
  // Confirmation « Créer un compte entreprise » (isolation des comptes t. 69-a)
  const [proSignup, setProSignup] = useState(false);

  // Installation PWA — même source d'événement que la bannière d'accueil.
  const { canInstall, promptInstall, isStandalone, isIOS } = useInstallPrompt();

  // Sécurité renforcée (2FA-lite) : code SMS exigé avant chaque paiement.
  const secureEnabled = useSecurity((s) => s.enabled);
  const setSecureEnabled = useSecurity((s) => s.setEnabled);

  /** Portabilité RGPD — télécharge « mes données » en JSON via blob */
  async function downloadMyData() {
    setExportBusy(true);
    try {
      const res = await fetch(`/api/profile/export?userId=${encodeURIComponent(user.id)}`);
      if (!res.ok) throw new Error("Export impossible");
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const m = /filename="([^"]+)"/.exec(cd);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = m?.[1] ?? `kene-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      const kb = Math.max(1, Math.round(blob.size / 1024));
      toast.success(`Mes données téléchargées · ${kb} Ko`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export impossible");
    } finally {
      setExportBusy(false);
    }
  }

  /** « Créer un compte entreprise » (t. 69-a) : l'espace Pro vit sur un compte
   *  DÉDIÉ, séparé du compte cliente — on pose le pont sessionStorage que
   *  l'onboarding consomme à son montage (mode entreprise), on vide le panier
   *  (règle de déconnexion) puis on ferme la session cliente. */
  function startProSignup() {
    try {
      sessionStorage.setItem("kene-pro-signup", "1");
    } catch {
      /* stockage indisponible : l'onboarding démarrera simplement en mode cliente */
    }
    // Session serveur fermée aussi (t. 71-e) : le cookie httpOnly signé est
    // effacé pour ne pas laisser traîner une session cliente pendant le
    // parcours d'inscription entreprise.
    void fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    clearCart();
    setUser(null);
    toast.info("À très vite — bienvenue dans l'aventure entreprise");
  }

  /** Installer l'app (prompt natif, ou instructions iOS / navigateur). */
  async function installApp() {
    if (canInstall) {
      const accepted = await promptInstall();
      if (accepted) toast.success("Kènè installée sur ton écran d'accueil 💛");
      return;
    }
    if (isIOS) {
      toast.info("Installer sur iPhone", {
        description: "Bouton Partager ⬆️ puis « Sur l'écran d'accueil ».",
        duration: 8000,
      });
      return;
    }
    toast.info("Installation manuelle", {
      description: "Menu du navigateur → « Installer l'application » ou « Ajouter à l'écran d'accueil ».",
      duration: 8000,
    });
  }

  /** Demande la permission navigateur puis relit l'état (toast succès/info). */
  async function enableNotifications() {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const result = await Notification.requestPermission();
    notifyPermListeners(); // relecture immédiate du snapshot par le hook
    if (result === "granted") toast.success("Notifications activées");
    else toast.info("Notifications refusées", { description: "Tu pourras les réactiver à tout moment dans les réglages du navigateur." });
  }

  /** Langue de l'interface (i18n) — indépendante de la langue de lecture vocale. */
  function selectLang(l: Lang) {
    if (l === lang) return;
    setLang(l);
    const label = LANGS.find((x) => x.id === l)?.label ?? "";
    toast.success(`Interface en ${label.toLowerCase()}`);
  }

  /** Sécurité renforcée : bascule la re-vérification par code avant paiement. */
  function toggleSecure() {
    const next = !secureEnabled;
    setSecureEnabled(next);
    if (next) toast.success("Sécurité renforcée activée");
    else toast("Sécurité renforcée désactivée");
  }

  return (
    <>
      <Reveal className="pt-4 pb-2 flex flex-col gap-6" stagger={0.07}>
        <RevealItem className="self-start">
          <button onClick={() => setClientTab("accueil")} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary rounded min-h-10 px-1" aria-label={t("profile.back.aria")}>
            <ArrowLeft size={15} /> {t("tab.home")}
          </button>
        </RevealItem>

        {/* Compte */}
        <RevealItem>
          <section aria-labelledby="set-acc-t" className="k-card overflow-hidden rounded-[24px]">
            <div className="kente-band h-1.5 w-full" aria-hidden="true" />
            <div className="p-5">
              <div className="flex items-center gap-4">
                <span className="k-glow-gold grid place-items-center h-16 w-16 rounded-full bg-gradient-to-br from-[#C8951E] to-[#A0522D] text-[#FFF9EC] font-heading font-black text-2xl">
                  {user.name.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-heading font-black text-[22px] leading-tight truncate">{user.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1 font-mono"><Phone size={12} /> {user.phone}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5"><MapPin size={12} /> {user.city || "Ville non renseignée"}</p>
                </div>
              </div>
              <button
                onClick={() => setClientTab("profil")}
                className="k-btn-gold mt-4 h-11 w-full rounded-xl text-primary-foreground text-sm font-bold inline-flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <Pencil size={15} /> Modifier mon profil
              </button>
              <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground leading-snug">
                <ShieldCheck size={13} className="mt-px shrink-0 text-success" aria-hidden="true" />
                Session conservée sur cet appareil — tu restes connectée comme sur tes applis préférées.
              </p>
            </div>
          </section>
        </RevealItem>

        {/* Apparence — Clair/Sombre (next-themes, valeurs light/dark uniquement) */}
        <RevealItem>
          <section aria-labelledby="set-look-t" className="k-card rounded-[24px] p-4">
            <div className="flex items-center gap-3">
              <IconBadge icon={<SunMedium size={19} />} tone="gold" />
              <div className="flex-1 min-w-0">
                <p id="set-look-t" className="text-xs font-bold">Apparence</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">Clair de jour, sombre le soir — ton choix s&apos;applique aussitôt, sur tout Kènè.</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => setTheme("light")}
                aria-pressed={activeTheme === "light"}
                className={`h-12 rounded-[14px] inline-flex items-center justify-center gap-2 text-xs font-bold active:scale-[0.98] transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${activeTheme === "light" ? "k-btn-gold text-primary-foreground" : "k-chip"}`}
              >
                <SunMedium size={16} /> Clair {activeTheme === "light" && <Check size={14} aria-hidden="true" />}
              </button>
              <button
                onClick={() => setTheme("dark")}
                aria-pressed={activeTheme === "dark"}
                className={`h-12 rounded-[14px] inline-flex items-center justify-center gap-2 text-xs font-bold active:scale-[0.98] transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${activeTheme === "dark" ? "k-btn-gold text-primary-foreground" : "k-chip"}`}
              >
                <Moon size={16} /> Sombre {activeTheme === "dark" && <Check size={14} aria-hidden="true" />}
              </button>
            </div>
          </section>
        </RevealItem>

        {/* Langue de l'interface — i18n UI, indépendante de la lecture vocale
            (la langue TTS se règle dans les pilules du résumé vocal, accueil) */}
        <RevealItem>
          <section aria-labelledby="lang-t" className="k-card rounded-[24px] p-4">
            <div className="flex items-center gap-3">
              <IconBadge icon={<Languages size={19} />} tone="gold" />
              <div className="flex-1 min-w-0">
                <p id="lang-t" className="text-xs font-bold">{t("lang.selector.label")}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{t("lang.selector.note")}</p>
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
                    className={`k-chip rounded-[14px] border p-3 min-h-12 text-left active:scale-[0.98] transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
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
                    <span className="block text-[10px] text-muted-foreground mt-1">{l.note}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </RevealItem>

        {/* Notifications — permission navigateur (carte masquée si l'API
            n'existe pas sur cet appareil ; pas d'abonnement push au POC) */}
        {notifPerm !== "unsupported" && (
          <RevealItem>
            <section aria-labelledby="set-notif-t" className="k-card rounded-[24px] p-4">
              <div className="flex items-center gap-3">
                <IconBadge icon={<Bell size={19} />} tone="gold" />
                <div className="flex-1 min-w-0">
                  <p id="set-notif-t" className="text-xs font-bold">Notifications</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">Rappels de rendez-vous, suivis de diagnostic et surprises — sur cet appareil.</p>
                </div>
                {notifPerm === "granted" && (
                  <span className="rounded-full bg-success/15 text-success px-2.5 py-1 text-[10px] font-bold">Activées</span>
                )}
              </div>
              {notifPerm === "default" && (
                <button
                  onClick={() => void enableNotifications()}
                  className="k-btn-gold mt-3 h-11 w-full rounded-xl text-primary-foreground text-xs font-bold inline-flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <Bell size={15} /> Activer les notifications
                </button>
              )}
              {notifPerm === "denied" && (
                <p className="mt-3 text-[11px] text-muted-foreground leading-snug">
                  Réactive-les dans les réglages du navigateur (icône cadenas à gauche de l&apos;adresse) si tu changes d&apos;avis.
                </p>
              )}
            </section>
          </RevealItem>
        )}

        {/* Sécurité renforcée — 2FA-lite : code SMS avant chaque paiement.
            Toute la rangée est le bouton (cible ≥ 40 px) ; l'indicateur est un
            pseudo-switch purement décoratif (un vrai Switch shadcn rendrait un
            <button> imbriqué — HTML invalide + erreur d'hydratation). */}
        <RevealItem>
          <section aria-labelledby="sec-t" className="k-card rounded-[24px] p-4">
            <button
              type="button"
              role="switch"
              aria-checked={secureEnabled}
              aria-label="Sécurité renforcée avant paiement"
              onClick={toggleSecure}
              className="w-full flex items-center gap-3 rounded-xl text-left active:scale-[0.99] transition-transform focus-visible:outline-2 focus-visible:outline-primary"
            >
              <IconBadge icon={<ShieldCheck size={19} />} tone="gold" />
          <span className="flex-1 min-w-0 py-1.5">
            <span id="sec-t" className="block text-xs font-bold">Sécurité renforcée</span>
            <span className="block text-[11px] text-muted-foreground mt-0.5 leading-snug">Exige un code par SMS avant chaque paiement — même si quelqu&apos;un a ton téléphone.</span>
          </span>
          <span aria-hidden="true" className={`pointer-events-none ml-auto inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${secureEnabled ? "bg-primary" : "bg-input"}`}>
            <span className={`block size-5 rounded-full bg-[#FFF9EC] shadow transition-transform duration-200 ${secureEnabled ? "translate-x-5" : "translate-x-0"}`} />
          </span>
            </button>
          </section>
        </RevealItem>

        {/* Confidentialité & données — statut du consentement santé */}
        <RevealItem>
          <section aria-labelledby="cons-t" className="k-card rounded-[24px] p-4 flex items-center gap-3">
            <IconBadge icon={<ShieldCheck size={19} />} tone={user.consentHealth ? "success" : "bissap"} />
            <div className="flex-1">
              <p className="text-xs font-semibold">Consentement données santé</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{user.consentHealth ? "Accordé — photos et diagnostics utilisés uniquement pour tes analyses." : "Non accordé — requis pour le diagnostic IA."}</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${user.consentHealth ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive"}`}>
              {user.consentHealth ? "Actif" : "Inactif"}
            </span>
          </section>
        </RevealItem>

        {/* Mes données — portabilité RGPD (art. 20) */}
        <RevealItem>
          <section aria-labelledby="rgpd-t" className="k-card rounded-[24px] p-4">
            <div className="flex items-center gap-3">
              <IconBadge icon={<Download size={19} />} tone="terre" />
              <div className="flex-1 min-w-0">
                <p id="rgpd-t" className="text-xs font-bold flex items-center gap-1.5">Mes données <span className="rounded-full bg-muted px-1.5 py-px text-[9px] font-semibold text-muted-foreground">RGPD</span></p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">Ton dossier complet en un fichier : diagnostics, rendez-vous, commandes, wallet, parrainage, notifications.</p>
              </div>
            </div>
            <button
              onClick={downloadMyData}
              disabled={exportBusy}
              className="k-btn-gold mt-3 h-11 w-full rounded-xl text-primary-foreground text-xs font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {exportBusy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              {exportBusy ? "Préparation…" : "Télécharger mes données (JSON)"}
            </button>
            <p className="mt-2 text-[10px] text-muted-foreground">Art. 20 RGPD — droit à la portabilité. Les photos ne sont pas incluses (poids) ; les résultats complets oui.</p>
          </section>
        </RevealItem>

        {/* Application — installation PWA sur l'écran d'accueil */}
        <RevealItem>
          <section aria-labelledby="app-t" className="k-card rounded-[24px] p-4">
            <div className="flex items-center gap-3">
              <IconBadge icon={<Smartphone size={19} />} tone="gold" />
          <div className="flex-1 min-w-0">
            <p id="app-t" className="text-xs font-bold">Application</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">Installe Kènè sur ton écran d&apos;accueil : un tap pour ouvrir, et tes diagnostics restent consultables même hors-ligne.</p>
          </div>
        </div>
        {isStandalone ? (
          <p className="mt-3 rounded-xl bg-success/10 text-success text-xs font-semibold px-3 min-h-10 flex items-center gap-2">
            <Check size={15} className="shrink-0" /> Kènè est déjà installée sur ton téléphone
          </p>
        ) : (
            <button
              onClick={() => void installApp()}
              className="k-btn-gold mt-3 h-11 w-full rounded-xl text-primary-foreground text-xs font-bold inline-flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Download size={15} /> Installer Kènè
            </button>
          )}
        </section>
      </RevealItem>

        {/* Espace entreprise — compte DÉDIÉ séparé du compte cliente (isolation
            stricte t. 69-a) : plus d'entrée directe vers l'espace Pro, une
            information honnête + un départ assisté vers l'inscription. */}
        <RevealItem>
          <section aria-labelledby="prosignup-t" className="rounded-[24px] border-2 border-dashed border-primary/40 bg-primary/5 p-4">
            <p id="prosignup-t" className="flex items-center gap-2 font-heading font-bold text-sm text-primary">
              <Building2 size={17} aria-hidden="true" /> Vous êtes gérante d&apos;institut ?
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              L&apos;espace entreprise Kènè vit sur un compte dédié, séparé de ton compte cliente — agenda, caisse, CRM, paie, comptabilité.
            </p>
            <button
              onClick={() => setProSignup(true)}
              className="k-btn-gold mt-3 h-11 w-full rounded-xl text-primary-foreground text-xs font-bold inline-flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Créer un compte entreprise
            </button>
          </section>
        </RevealItem>

        {/* Abonnement (t. 71-c) — offres Kènè+ et quota diagnostics : écran
            caché « abonnement » (même porte que Paramètres, depuis ici). */}
        <RevealItem>
          <section aria-labelledby="sub-t" className="k-card rounded-[24px] p-2">
            <button
              onClick={() => setClientTab("abonnement" as ClientTab)}
              className="w-full flex items-center gap-3 rounded-[18px] p-2.5 text-left active:scale-[0.99] transition-transform focus-visible:outline-2 focus-visible:outline-primary"
            >
              <IconBadge icon={<Crown size={19} />} tone="gold" />
              <span className="flex-1 min-w-0">
                <span id="sub-t" className="block text-xs font-bold">Abonnement</span>
                <span className="block text-[11px] text-muted-foreground mt-0.5">Offres, quota diagnostics</span>
              </span>
              <ChevronRight size={16} className="text-muted-foreground shrink-0" aria-hidden="true" />
            </button>
          </section>
        </RevealItem>

        {/* Mentions légales (t. 71-c) — éditeur POC, santé, RGPD, cadre CI/SN,
            paiements simulés : écran caché « legal ». */}
        <RevealItem>
          <section aria-labelledby="legal-t" className="k-card rounded-[24px] p-2">
            <button
              onClick={() => setClientTab("legal" as ClientTab)}
              className="w-full flex items-center gap-3 rounded-[18px] p-2.5 text-left active:scale-[0.99] transition-transform focus-visible:outline-2 focus-visible:outline-primary"
            >
              <IconBadge icon={<Scale size={19} />} tone="terre" />
              <span className="flex-1 min-w-0">
                <span id="legal-t" className="block text-xs font-bold">Mentions légales</span>
                <span className="block text-[11px] text-muted-foreground mt-0.5">RGPD, santé, paiements</span>
              </span>
              <ChevronRight size={16} className="text-muted-foreground shrink-0" aria-hidden="true" />
            </button>
          </section>
        </RevealItem>

        {/* Déconnexion — le panier est vidé AVANT de perdre la session : la
            prochaine utilisatrice du téléphone n'hérite de rien. La session
            SERVEUR (cookie httpOnly signé, t. 71-b) est fermée dans la foulée. */}
        <RevealItem>
          <button
            onClick={() => {
              void fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
              clearCart();
              setUser(null);
              toast.info("À bientôt sur Kènè");
            }}
            className="h-12 rounded-2xl border border-destructive/40 bg-destructive/10 text-destructive text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform focus-visible:outline-2 focus-visible:outline-destructive"
          >
            <LogOut size={16} /> Déconnexion
          </button>
        </RevealItem>

        {/* À propos */}
        <RevealItem>
          <section aria-labelledby="about-t" className="k-card rounded-[24px] p-5 text-center">
            <p id="about-t" className="font-heading font-bold text-sm text-primary">Kènè — La beauté mélanoderme, enfin comprise.</p>
            <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">POC v1.0</p>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/80">Paiements simulés · estimations IA non médicales.</p>
          </section>
        </RevealItem>
      </Reveal>

      {/* Confirmation « Créer un compte entreprise » — la session cliente va
          être fermée : le dialogue le dit honnêtement (isolation t. 69-a). */}
      <AlertDialog open={proSignup} onOpenChange={setProSignup}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading font-bold">Créer un compte entreprise ?</AlertDialogTitle>
            <AlertDialogDescription>
              Ta session cliente sera fermée sur cet appareil. Tu créeras ton espace entreprise avec ce même numéro s&apos;il ne gère pas déjà un institut, ou un numéro dédié.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={startProSignup}>Continuer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
