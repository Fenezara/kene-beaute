"use client";
// Kènè Pro — Paramètres: compte, affichage, langue, session.
// Sobriété back-office: volontairement PAS d'accès à l'espace cliente ici
// (isolation — l'app pro vit sur un compte dédié, fermer la session
// ramène simplement à l'accueil Kènè via le clamp du store, jamais setSpace).
// Hydratation: l'état actif Clair/Sombre est gardé par useSyncExternalStore
// (pattern ThemeToggle / use-install) — zéro setState-in-effect, zéro flash.
// — carte « Identité visuelle »: photo de vitrine de l'institut
// (façade, enseigne ou intérieur) qui remplace le visuel calculé partout
// (annuaire, boutique, fiche cliente) — upload local redimensionné.
import { useEffect, useRef, useSyncExternalStore, useState } from "react";
import { useTheme } from "next-themes";
import { Building2, Camera, Check, ChevronRight, CreditCard, Crown, ImageOff, Languages, Loader2, LogOut, Moon, Phone, Receipt, SunMedium } from "lucide-react";
import { DuafeIcon } from "@/components/kene/icons";
import { toast } from "sonner";
import { LANGS, type Lang } from "@/lib/kene/i18n";
import { useT } from "@/lib/kene/use-t";
import { apiGet, apiPost, resizeImage } from "@/lib/kene/api";
import { Badge } from "@/components/ui/badge";
import { Eyebrow, IconBadge } from "@/components/kene/ui2026";
import { useKene } from "@/store/kene";
import { InitialAvatar, SectionHeader } from "./ui-bits";
import type { ProSectionId } from "./ProApp";
import { Switch } from "@/components/ui/switch";
import { getTenantPosSettings, saveTenantPosSettings, type TenantPosSettings } from "@/lib/kene/tenant-settings";

/* Porte d'hydratation: false pendant le rendu serveur + l'hydratation, true
 * ensuite — l'état actif Clair/Sombre ne s'affiche qu'une fois le thème
 * réellement lisible (règle react-hooks/set-state-in-effect: pas de setState
 * dans un effet, même approche que ThemeToggle et use-install). */
const subscribeNothing = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNothing, () => true, () => false);
}

export function SettingsSection({ tenantId, tenantName, tenantCity, onNavigate }: { tenantId: string; tenantName: string; tenantCity?: string; onNavigate?: (s: ProSectionId) => void }) {
  const sessionUser = useKene((s) => s.user);
  const setUser = useKene((s) => s.setUser);
  const setSpace = useKene((s) => s.setSpace);
  const clearCart = useKene((s) => s.clearCart);
  const { lang, setLang } = useT();

  // Seule la patronne / gérante propriétaire (compte sans restriction de poste) est habilitée
  const isOwner = sessionUser?.role === "admin" || (sessionUser?.role === "pro" && !sessionUser?.employeeRole);
  const [posSettings, setPosSettings] = useState<TenantPosSettings>(() => getTenantPosSettings(tenantId));

  useEffect(() => {
    setPosSettings(getTenantPosSettings(tenantId));
  }, [tenantId]);

  function updateVat(checked: boolean) {
    const next = { ...posSettings, isVatSubject: checked };
    setPosSettings(next);
    saveTenantPosSettings(tenantId, next);
    toast.success(checked ? "TVA 18 % activée (Régime du réel)" : "TVA désactivée (Régime synthétique / Exonéré)", {
      description: checked
        ? "La TVA sera calculée et ventilée sur les tickets de caisse et clôtures Z."
        : "Les tickets et clôtures porteront la mention légale « Exonéré de TVA ».",
    });
  }

  function updatePaymentMethod(method: keyof TenantPosSettings["allowedPaymentMethods"], checked: boolean) {
    const nextMethods = { ...posSettings.allowedPaymentMethods, [method]: checked };
    const hasAtLeastOne = Object.values(nextMethods).some(Boolean);
    if (!hasAtLeastOne) {
      toast.error("Au moins un moyen de paiement doit rester actif pour la caisse");
      return;
    }
    const next = { ...posSettings, allowedPaymentMethods: nextMethods };
    setPosSettings(next);
    saveTenantPosSettings(tenantId, next);
    toast.success("Modes de paiement caisse mis à jour");
  }

  // ── Photo de vitrine ──
  // Le visuel ACTUEL vient de l'annuaire public (image + hasPhoto), l'aperçu
  // local d'un upload frais prend le dessus le temps de la requête.
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [hasPhoto, setHasPhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    apiGet<{ institutes: { id: string; image: string; hasPhoto?: boolean }[] }>("/api/institutes")
      .then((r) => {
        if (!alive) return;
        const mine = r.institutes.find((i) => i.id === tenantId);
        if (mine) {
          setCurrentImage(mine.image);
          setHasPhoto(Boolean(mine.hasPhoto));
        }
      })
      .catch(() => {}); // non bloquant: la carte affiche l'état vide
    return () => {
      alive = false;
    };
  }, [tenantId]);

  async function uploadVitrine(file: File | undefined) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Photo trop lourde — choisis une image plus légère");
      return;
    }
    setPhotoBusy(true);
    try {
      const dataUrl = await resizeImage(file, 1080); // vitrine plus large que l'avatar
      setPhotoPreview(dataUrl);
      await apiPost("/api/pro/institute-photo", { tenantId, photoData: dataUrl });
      setHasPhoto(true);
      setCurrentImage(`/api/media/tenant/${tenantId}`);
      toast.success("Photo de vitrine mise à jour", {
        description: "Elle remplace le visuel par défaut dans l'annuaire et la boutique.",
      });
    } catch (e) {
      setPhotoPreview(null);
      toast.error(e instanceof Error ? e.message : "Photo impossible");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removeVitrine() {
    setPhotoBusy(true);
    try {
      await apiPost("/api/pro/institute-photo", { tenantId, photoData: null });
      setHasPhoto(false);
      setPhotoPreview(null);
      setCurrentImage(null);
      toast.success("Photo retirée — retour au visuel par défaut");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Suppression impossible");
    } finally {
      setPhotoBusy(false);
    }
  }

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

 /** Ferme la session: le clamp du store ramène à l'accueil cliente
 * (setUser(null) → espace "client" sans session → onboarding). La session
 * SERVEUR (cookie httpOnly signé,) est fermée dans la foulée. */
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

      {/* Identité visuelle — photo de vitrine de l'institut */}
      <div className="k-card rounded-[20px] p-4">
        <div className="flex items-center gap-3">
          <IconBadge icon={<Camera size={18} />} tone="gold" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold">Photo de l&apos;institut</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
              Façade, enseigne ou intérieur — elle devient la vitrine de {tenantName} dans l&apos;annuaire et la boutique.
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-20 w-32 shrink-0 overflow-hidden rounded-[14px] border border-border bg-muted">
            {(photoPreview || currentImage || hasPhoto) ? (
              <img
                src={photoPreview ?? currentImage ?? `/api/media/tenant/${tenantId}`}
                alt={`Vitrine de ${tenantName}`}
                className="size-full object-cover"
              />
            ) : (
              <span className="grid size-full place-items-center text-muted-foreground">
                <Building2 size={22} aria-hidden="true" />
              </span>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <button
              type="button"
              onClick={() => photoInput.current?.click()}
              disabled={photoBusy}
              className="h-11 rounded-[14px] border border-border bg-card px-3 text-xs font-bold inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-transform hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"
            >
              {photoBusy ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} aria-hidden="true" />}
              {hasPhoto ? "Changer la photo" : "Ajouter une photo"}
            </button>
            {hasPhoto && (
              <button
                type="button"
                onClick={() => void removeVitrine()}
                disabled={photoBusy}
                className="h-10 rounded-[14px] px-3 text-xs font-semibold text-muted-foreground inline-flex items-center justify-center gap-2 hover:text-destructive active:scale-[0.98] transition-transform focus-visible:outline-2 focus-visible:outline-destructive disabled:opacity-60"
              >
                <ImageOff size={14} aria-hidden="true" /> Retirer (visuel par défaut)
              </button>
            )}
            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                void uploadVitrine(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
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

      {/* ── Régime fiscal & Encaissement (Strictement réservé à la Patronne / Gérante) ── */}
      {isOwner && (
        <div className="k-card rounded-[20px] p-4 sm:p-5 space-y-4 border border-gold/40 shadow-sm bg-gradient-to-b from-card to-background">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <IconBadge icon={<Receipt size={18} />} tone="gold" />
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold text-foreground">Régime fiscal &amp; Encaissement</p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 text-gold-text border border-gold/30 px-2 py-0.5 text-[10px] font-bold">
                    👑 Patronne
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                  Configuration fiscale et modes de paiement autorisés à la caisse de l&apos;institut.
                </p>
              </div>
            </div>
          </div>

          {/* Toggle TVA 18% SYSCOHADA */}
          <div className="rounded-xl border border-border/70 bg-muted/20 p-3.5 flex items-center justify-between gap-4">
            <div className="space-y-1 pr-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-foreground">Assujetti à la TVA (18 % SYSCOHADA)</span>
                {posSettings.isVatSubject ? (
                  <span className="rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold">
                    Activée (Réel)
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold">
                    Désactivée (Exonéré)
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {posSettings.isVatSubject
                  ? "Les tickets et clôtures de caisse ventilent le montant HT et la TVA 18 % incluse."
                  : "Régime synthétique / micro-entreprise : les reçus de caisse portent la mention légale « Exonéré de TVA »."}
              </p>
            </div>
            <Switch
              checked={posSettings.isVatSubject}
              onCheckedChange={updateVat}
              aria-label="Activer ou désactiver la TVA 18%"
            />
          </div>

          {/* Modes de paiement autorisés à la caisse */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-2">
              <CreditCard size={14} className="text-primary" />
              <p className="text-[11px] font-bold text-foreground uppercase tracking-wider">Modes de paiement autorisés en caisse</p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Décidez quels modes d&apos;encaissement vos employées peuvent sélectionner lors de l&apos;encaissement.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              {[
                { key: "cash", label: "Espèces (Tiroir-caisse)", note: "Monnaie physique" },
                { key: "wave", label: "Wave Mobile Money", note: "Paiement 1% sans frais" },
                { key: "orange", label: "Orange Money", note: "Paiement cellulaire" },
                { key: "card", label: "Carte Bancaire (TPE)", note: "Visa, Mastercard" },
                { key: "wallet", label: "Wallet Kènè", note: "Portefeuille cliente" },
              ].map((m) => {
                const checked = posSettings.allowedPaymentMethods[m.key as keyof TenantPosSettings["allowedPaymentMethods"]];
                return (
                  <div
                    key={m.key}
                    className="flex items-center justify-between rounded-xl border border-border/50 bg-background/60 p-2.5 px-3"
                  >
                    <div>
                      <p className="text-xs font-bold text-foreground">{m.label}</p>
                      <p className="text-[10px] text-muted-foreground">{m.note}</p>
                    </div>
                    <Switch
                      checked={checked}
                      onCheckedChange={(val) => updatePaymentMethod(m.key as keyof TenantPosSettings["allowedPaymentMethods"], val)}
                      aria-label={`Autoriser ${m.label}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

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

      {/* Abonnement & facturation — lien vers la section dédiée
 (même pattern de navigation que les autres sections). */}
      <div className="k-card rounded-[20px] p-2">
        <button
          onClick={() => onNavigate?.("abonnement")}
          className="w-full flex items-center gap-3 rounded-[14px] p-2.5 text-left active:scale-[0.99] transition-transform focus-visible:outline-2 focus-visible:outline-primary"
        >
          <IconBadge icon={<Crown size={18} />} tone="gold" />
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-bold">Abonnement &amp; facturation</span>
            <span className="block text-[11px] text-muted-foreground mt-0.5">Offres Essentiel / Complexe · facturation certifiée</span>
          </span>
          <ChevronRight size={16} className="text-muted-foreground shrink-0" aria-hidden="true" />
        </button>
      </div>

      {/* Espace Beauté personnel (bilan dermo-biométrique, Dr. Kènè & soins) */}
      <div className="k-card rounded-[20px] p-4 bg-gradient-to-br from-primary/5 via-card to-gold/5 border border-primary/20">
        <div className="flex items-center gap-3">
          <IconBadge icon={<DuafeIcon size={18} />} tone="gold" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold">Mon Espace Beauté personnel</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
              Accède à ton espace beauté personnel : bilan dermo-biométrique, Dr. Kènè, boutique et rituels.
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            setSpace("client");
            if (typeof window !== "undefined") {
              window.history.pushState(null, "", "/");
              window.dispatchEvent(new Event("popstate"));
            }
            toast.success("Bienvenue dans ton Espace Beauté personnel 🌸");
          }}
          className="mt-3 h-11 w-full rounded-xl k-btn-gold text-primary-foreground text-sm font-bold inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-transform focus-visible:outline-2 focus-visible:outline-primary shadow-xs"
        >
          <DuafeIcon size={16} /> Ouvrir Mon Espace Beauté 🌸
        </button>
      </div>

      {/* Session — destructif sobre (jamais de setSpace: le clamp store
 ramène à l'accueil cliente, isolation) */}
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
          Paiements certifiés Mobile Money & Carte · conformité CNPS CI / IPM SN / SYSCOHADA. Réservations, commandes et ventes de l&apos;institut arrivent en temps réel lorsque le service de notifications est en ligne.
        </p>
      </div>
    </div>
  );
}
