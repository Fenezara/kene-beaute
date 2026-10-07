"use client";
// Kènè Cliente — Paramètres: l'écran de réglages standard façon
// applis 2026 (TikTok / Instagram) — compte, apparence, langue, notifications,
// sécurité, confidentialité, application, espace entreprise, session.
// Les sections « réglages » vivaient dans ProfileScreen (langue, consentement,
// RGPD, 2FA, PWA, espace entreprise, déconnexion): elles ont été DÉPLACÉES ici
// avec un code métier identique (imports adaptés uniquement). Le Profil garde
// l'identité, le profil peau et le parrainage.
// Hydratation: la permission navigateur et l'état « monté » du thème sont lus
// via useSyncExternalStore (pattern use-install.ts) — aucune API web n'est
// touchée pendant le rendu, zéro setState-in-effect, zéro mismatch.

import { useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Building2,
  Check,
  ChevronRight,
  Crown,
  Download,
  Hand,
  Languages,
  Loader2,
  Lock,
  LogOut,
  MapPin,
  Moon,
  Palette,
  Pencil,
  Phone,
  Scale,
  Shield,
  ShieldCheck,
  Smartphone,
  SunMedium,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { LANGS, type Lang } from "@/lib/kene/i18n";
import { useT } from "@/lib/kene/use-t";
import { apiPost, ApiError } from "@/lib/kene/api";
import { forgetAccount } from "@/lib/kene/last-account";
import { performLogout } from "@/lib/kene/logout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { IconBadge, Reveal, RevealItem } from "@/components/kene/ui2026";
import { useKene, type ClientTab, type SessionUser } from "@/store/kene";
import { useSecurity } from "@/store/security";
import { useInstallPrompt } from "@/components/kene/pwa/use-install";
import { getThumbMode, setThumbMode, subscribeThumbMode } from "@/lib/kene/thumb-mode";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import { cn } from "@/lib/utils";

/* ─── Porte d'hydratation (thème) ───
 * false pendant le rendu serveur + l'hydratation, true ensuite: l'état actif
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
 * focus/visibilité; notifyPermListeners force la relecture juste après
 * Notification.requestPermission. */
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

function SettingsGroupHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-2.5 pt-3 pb-1 border-b border-border/50">
      <span className="grid place-items-center size-7 rounded-xl bg-primary/10 text-primary shrink-0">
        <Icon size={15} />
      </span>
      <div className="min-w-0">
        <h3 className="font-heading font-black text-xs uppercase tracking-wider text-foreground">
          {title}
        </h3>
        <p className="text-[10.5px] text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
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

  // Préférences de notifications granulaires
  const [notifPrefs, setNotifPrefs] = useState<{ reminders: boolean; weather: boolean; promos: boolean }>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("kene_notif_prefs");
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return { reminders: true, weather: true, promos: false };
  });

  const toggleNotifPref = (k: "reminders" | "weather" | "promos") => {
    haptic(HAPTIC.light);
    setNotifPrefs((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      try {
        localStorage.setItem("kene_notif_prefs", JSON.stringify(next));
      } catch {}
      return next;
    });
    toast.success("Préférences de notification mises à jour");
  };

  const [exportBusy, setExportBusy] = useState(false);
  // Confirmation « Créer un compte entreprise » (isolation des comptes)
  const [proSignup, setProSignup] = useState(false);
  // Suppression définitive du compte (conforme Apple 5.1.1(v) et RGPD/ARTCI)
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePin, setDeletePin] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      const res = await apiPost<{ ok: boolean; message: string }>("/api/auth/delete-account", {
        pin: deletePin || undefined,
      });
      forgetAccount();
      clearCart();
      setUser(null);
      setDeleteOpen(false);
      haptic(HAPTIC.success);
      toast.success("Compte supprimé", {
        description: res.message || "Tes données personnelles ont été purgées. À bientôt sur Kènè.",
      });
    } catch (e) {
      haptic(HAPTIC.warning);
      toast.error(e instanceof ApiError ? e.message : "Erreur lors de la suppression — réessaie");
    } finally {
      setDeleting(false);
    }
  }

  // Installation PWA — même source d'événement que la bannière d'accueil.
  const { canInstall, promptInstall, isStandalone, isIOS } = useInstallPrompt();

  // Sécurité renforcée (2FA-lite): code SMS exigé avant chaque paiement.
  const secureEnabled = useSecurity((s) => s.enabled);
  // Pouce d'Or — préférence appareil (localStorage), lue via
  // useSyncExternalStore: aucune API web pendant le rendu, zéro mismatch.
  const thumbOn = useSyncExternalStore(subscribeThumbMode, getThumbMode, () => false);
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

 /** « Créer un compte entreprise »: l'espace Pro vit sur un compte
 * DÉDIÉ, séparé du compte cliente — on pose le pont sessionStorage que
 * l'onboarding consomme à son montage (mode entreprise), on vide le panier
 * (règle de déconnexion) puis on ferme la session cliente. */
  function startProSignup() {
    try {
      sessionStorage.setItem("kene-pro-signup", "1");
    } catch {
 /* stockage indisponible: l'onboarding démarrera simplement en mode cliente */
    }
    // Session serveur fermée aussi: le cookie httpOnly signé est
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

 /** Sécurité renforcée: bascule la re-vérification par code avant paiement. */
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
          <button onClick={() => setClientTab("profil")} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary rounded min-h-10 px-1" aria-label="Retour au profil">
            <ArrowLeft size={15} /> Retour
          </button>
        </RevealItem>

        {/* ───────── GROUPE 1 : MON COMPTE & SÉCURITÉ ───────── */}
        <RevealItem>
          <SettingsGroupHeader
            icon={User}
            title="Mon Compte & Sécurité"
            subtitle="Identité, coordonnées et protection des paiements"
          />
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

        {/* Sécurité renforcée — 2FA-lite: code SMS avant chaque paiement */}
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
                <span id="sec-t" className="block text-xs font-bold">Sécurité renforcée (2FA)</span>
                <span className="block text-[11px] text-muted-foreground mt-0.5 leading-snug">Exige un code par SMS avant chaque paiement — même si quelqu&apos;un manipule ton téléphone.</span>
              </span>
              <span aria-hidden="true" className={`pointer-events-none ml-auto inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${secureEnabled ? "bg-primary" : "bg-input"}`}>
                <span className={`block size-5 rounded-full bg-[#FFF9EC] shadow transition-transform duration-200 ${secureEnabled ? "translate-x-5" : "translate-x-0"}`} />
              </span>
            </button>
          </section>
        </RevealItem>

        {/* ───────── GROUPE 2 : PRÉFÉRENCES & AFFICHAGE ───────── */}
        <RevealItem>
          <SettingsGroupHeader
            icon={Palette}
            title="Préférences & Affichage"
            subtitle="Confort visuel, langue et alertes personnalisées"
          />
        </RevealItem>

        {/* Apparence — Clair/Sombre */}
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

        {/* Langue de l'interface */}
        <RevealItem>
          <section aria-labelledby="lang-t" className="k-card rounded-[24px] p-4">
            <div className="flex items-center gap-3">
              <IconBadge icon={<Languages size={19} />} tone="gold" />
              <div className="flex-1 min-w-0">
                <p id="lang-t" className="text-xs font-bold">{t("lang.selector.label")}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{t("lang.selector.note")}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2">
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

        {/* Pouce d'Or — mode une main */}
        <RevealItem>
          <section aria-labelledby="thumb-t" className="k-card rounded-[24px] p-4">
            <button
              type="button"
              role="switch"
              aria-checked={thumbOn}
              aria-label="Mode une main Pouce d'Or"
              onClick={() => {
                setThumbMode(!thumbOn);
                haptic(HAPTIC.light);
                toast(!thumbOn ? "Pouce d'Or activé" : "Pouce d'Or désactivé", {
                  description: !thumbOn
                    ? "Les actions essentielles de chaque écran descendent à portée de pouce."
                    : "Les écrans retrouvent leurs actions d'origine.",
                });
              }}
              className="w-full flex items-center gap-3 rounded-xl text-left active:scale-[0.99] transition-transform focus-visible:outline-2 focus-visible:outline-primary"
            >
              <IconBadge icon={<Hand size={19} />} tone="gold" />
              <span className="flex-1 min-w-0 py-1.5">
                <span id="thumb-t" className="block text-xs font-bold">Pouce d&apos;Or — mode une main</span>
                <span className="block text-[11px] text-muted-foreground mt-0.5 leading-snug">Les actions essentielles de chaque écran restent sous ton pouce, dans une barre collante au-dessus de la navigation.</span>
              </span>
              <span aria-hidden="true" className={`pointer-events-none ml-auto inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${thumbOn ? "bg-primary" : "bg-input"}`}>
                <span className={`block size-5 rounded-full bg-[#FFF9EC] shadow transition-transform duration-200 ${thumbOn ? "translate-x-5" : "translate-x-0"}`} />
              </span>
            </button>
          </section>
        </RevealItem>

        {/* Notifications — permission navigateur & contrôles granulaires */}
        {notifPerm !== "unsupported" && (
          <RevealItem>
            <section aria-labelledby="set-notif-t" className="k-card rounded-[24px] p-4 space-y-3">
              <div className="flex items-center gap-3">
                <IconBadge icon={<Bell size={19} />} tone="gold" />
                <div className="flex-1 min-w-0">
                  <p id="set-notif-t" className="text-xs font-bold">Notifications</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                    Rappels de rendez-vous, dermo-météo et exclusivités instituts.
                  </p>
                </div>
                {notifPerm === "granted" && (
                  <span className="rounded-full bg-success/15 text-success px-2.5 py-1 text-[10px] font-bold">
                    Système actif
                  </span>
                )}
              </div>

              {notifPerm === "default" && (
                <button
                  onClick={() => void enableNotifications()}
                  className="k-btn-gold h-10 w-full rounded-xl text-primary-foreground text-xs font-bold inline-flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <Bell size={14} /> Activer les notifications de l&apos;appareil
                </button>
              )}

              {notifPerm === "denied" && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-snug bg-amber-500/10 p-2.5 rounded-xl">
                  Notifications bloquées dans votre navigateur. Débloquez-les via l&apos;icône cadenas si vous souhaitez recevoir les alertes.
                </p>
              )}

              {/* Préférences thématiques granulaires */}
              <div className="pt-2 border-t border-border/60 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Canaux personnalisés :
                </p>
                {[
                  { key: "reminders" as const, label: "Rappels de soins & rendez-vous", desc: "Suivi post-soin cabine et dates importantes" },
                  { key: "weather" as const, label: "Conseil Dermo-Météo & UV", desc: "Adaptation au climat local et forte exposition UV" },
                  { key: "promos" as const, label: "Offres & Événements instituts", desc: "Nouveautés et privilèges des partenaires" },
                ].map((item) => (
                  <div key={item.key} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-background/50 border border-border/40">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground truncate">{item.label}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{item.desc}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={notifPrefs[item.key]}
                      onClick={() => toggleNotifPref(item.key)}
                      className={cn(
                        "inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-primary",
                        notifPrefs[item.key] ? "bg-primary" : "bg-input"
                      )}
                    >
                      <span
                        className={cn(
                          "block size-4 rounded-full bg-white shadow-sm transition-transform duration-150",
                          notifPrefs[item.key] ? "translate-x-4" : "translate-x-0"
                        )}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </RevealItem>
        )}

        {/* ───────── GROUPE 3 : CONFIDENTIALITÉ & DONNÉES ───────── */}
        <RevealItem>
          <SettingsGroupHeader
            icon={Shield}
            title="Confidentialité & Données"
            subtitle="Protection de votre vie privée, consentement santé et droits"
          />
        </RevealItem>

        {/* Confidentialité & données — statut du consentement santé */}
        <RevealItem>
          <section aria-labelledby="cons-t" className="k-card rounded-[24px] p-4 flex items-center gap-3">
            <IconBadge icon={<ShieldCheck size={19} />} tone={user.consentHealth ? "success" : "bissap"} />
            <div className="flex-1">
              <p className="text-xs font-semibold">Consentement données santé</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{user.consentHealth ? "Accordé — photos et diagnostics utilisés uniquement pour tes analyses." : "Non accordé — requis pour le bilan dermo-biométrique."}</p>
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
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">Ton dossier complet en un fichier : diagnostics, rendez-vous, commandes, parrainage, notifications.</p>
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

        {/* Zone Confidentialité / Droit à l'oubli — Suppression de compte */}
        <RevealItem>
          <section aria-labelledby="delete-account-t" className="rounded-[24px] border border-destructive/25 bg-destructive/5 p-4 space-y-2.5">
            <div className="flex items-center gap-2 text-destructive font-bold text-xs">
              <Trash2 size={16} />
              <span id="delete-account-t">Gestion des données & Droit à l&apos;oubli</span>
            </div>
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              Conformément aux normes de protection de la vie privée (ARTCI / RGPD), tu peux supprimer ton compte et purger définitivement tes photos et diagnostics de peau.
            </p>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="w-full h-11 rounded-xl border border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground text-xs font-bold transition-all flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-destructive"
            >
              <Trash2 size={14} />
              Supprimer définitivement mon compte
            </button>
          </section>
        </RevealItem>

        {/* ───────── GROUPE 4 : ÉCOSYSTÈME KÈNÈ & INFORMATIONS ───────── */}
        <RevealItem>
          <SettingsGroupHeader
            icon={Building2}
            title="Écosystème Kènè & Légal"
            subtitle="Espace partenaires, abonnement et informations légales"
          />
        </RevealItem>

        {/* Espace entreprise */}
        <RevealItem>
          <section aria-labelledby="prosignup-t" className="rounded-[24px] border-2 border-dashed border-primary/40 bg-primary/5 p-4">
            <p id="prosignup-t" className="flex items-center gap-2 font-heading font-bold text-sm text-primary">
              <Building2 size={17} aria-hidden="true" /> Vous dirigez un institut ou un spa ?
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Rejoignez les établissements partenaires Kènè pour accueillir vos clientes et proposer vos soins cabine.
            </p>
            <button
              onClick={() => setProSignup(true)}
              className="k-btn-gold mt-3 h-11 w-full rounded-xl text-primary-foreground text-xs font-bold inline-flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Créer mon compte entreprise
            </button>
          </section>
        </RevealItem>

        {/* Abonnement */}
        <RevealItem>
          <section aria-labelledby="sub-t" className="k-card rounded-[24px] p-2">
            <button
              onClick={() => setClientTab("abonnement" as ClientTab)}
              className="w-full flex items-center gap-3 rounded-[18px] p-2.5 text-left active:scale-[0.99] transition-transform focus-visible:outline-2 focus-visible:outline-primary"
            >
              <IconBadge icon={<Crown size={19} />} tone="gold" />
              <span className="flex-1 min-w-0">
                <span id="sub-t" className="block text-xs font-bold">Abonnement Kènè+</span>
                <span className="block text-[11px] text-muted-foreground mt-0.5">Offres, quota diagnostics et privilèges</span>
              </span>
              <ChevronRight size={16} className="text-muted-foreground shrink-0" aria-hidden="true" />
            </button>
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

        {/* Mentions légales */}
        <RevealItem>
          <section aria-labelledby="legal-t" className="k-card rounded-[24px] p-2">
            <button
              onClick={() => setClientTab("legal" as ClientTab)}
              className="w-full flex items-center gap-3 rounded-[18px] p-2.5 text-left active:scale-[0.99] transition-transform focus-visible:outline-2 focus-visible:outline-primary"
            >
              <IconBadge icon={<Scale size={19} />} tone="terre" />
              <span className="flex-1 min-w-0">
                <span id="legal-t" className="block text-xs font-bold">Mentions légales</span>
                <span className="block text-[11px] text-muted-foreground mt-0.5">RGPD, cadre sanitaire, conditions</span>
              </span>
              <ChevronRight size={16} className="text-muted-foreground shrink-0" aria-hidden="true" />
            </button>
          </section>
        </RevealItem>

        {/* À propos */}
        <RevealItem>
          <section aria-labelledby="about-t" className="k-card rounded-[24px] p-5 text-center">
            <p id="about-t" className="font-heading font-bold text-sm text-primary">Kènè — La beauté mélanoderme, enfin comprise.</p>
            <p className="mt-1.5 font-semibold text-xs text-foreground">Développé et édité par Dermo TIC</p>
            <p className="text-[11px] text-muted-foreground">Entreprise de développement technologique &amp; d&apos;applications</p>
            <p className="mt-1 font-mono text-[10.5px] text-muted-foreground">Plateforme SaaS &amp; Marketplace Kènè v1.0</p>
            <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground/80">
              Les produits et soins sont vendus et exécutés exclusivement par les instituts et cabinets partenaires certifiés.
            </p>
          </section>
        </RevealItem>

        {/* Déconnexion */}
        <RevealItem>
          <button
            onClick={() => void performLogout({ redirectUrl: "/", message: "À bientôt sur Kènè" })}
            className="h-12 rounded-2xl border border-destructive/40 bg-destructive/10 text-destructive text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform focus-visible:outline-2 focus-visible:outline-destructive w-full"
          >
            <LogOut size={16} /> Déconnexion
          </button>
        </RevealItem>
      </Reveal>

      {/* Confirmation « Créer un compte entreprise » — la session cliente va
 être fermée: le dialogue le dit honnêtement (isolation). */}
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

      {/* Dialogue de suppression définitive de compte (Apple App Store / Google Play / ARTCI) */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading font-bold text-destructive flex items-center gap-2">
              <AlertTriangle className="size-5 shrink-0" />
              Supprimer définitivement ton compte ?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed space-y-2">
              <span className="block">
                Cette action est <strong>immédiate et irréversible</strong>. Tes photos de diagnostic cutané, tes historiques de bilans dermo-biométriques et tes données personnelles seront définitivement purgés.
              </span>
              {user?.hasPin && (
                <span className="block text-foreground font-semibold pt-1">
                  Saisis ton code secret PIN pour confirmer la suppression :
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {user?.hasPin && (
            <div className="py-2">
              <Input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={deletePin}
                onChange={(e) => setDeletePin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Code secret (4 à 6 chiffres)"
                className="h-11 text-center font-mono tracking-widest text-lg"
              />
            </div>
          )}

          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={deleting} onClick={() => setDeletePin("")}>
              Annuler
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleting || (Boolean(user?.hasPin) && deletePin.length < 4)}
              onClick={handleDeleteAccount}
              className="h-11 font-bold gap-2"
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Confirmer la suppression
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
