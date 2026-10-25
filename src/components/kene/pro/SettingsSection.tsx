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
import { Building2, Camera, Check, CheckCircle2, ChevronRight, Clock, CreditCard, Crown, ImageOff, KeyRound, Languages, Loader2, Lock, LogIn, LogOut, MapPin, Moon, Phone, Receipt, ShieldCheck, Sparkles, SunMedium } from "lucide-react";
import { DuafeIcon } from "@/components/kene/icons";
import { toast } from "sonner";
import { LANGS, type Lang } from "@/lib/kene/i18n";
import { useT } from "@/lib/kene/use-t";
import { apiGet, apiPatch, apiPost, resizeImage } from "@/lib/kene/api";
import { Badge } from "@/components/ui/badge";
import { Eyebrow, IconBadge } from "@/components/kene/ui2026";
import { ChangePhoneModal } from "@/components/kene/auth/ChangePhoneModal";
import { ChangePinModal } from "@/components/kene/auth/ChangePinModal";
import { useKene } from "@/store/kene";
import { performLogout } from "@/lib/kene/logout";
import { InitialAvatar, SectionHeader } from "./ui-bits";
import type { ProSectionId } from "./ProApp";
import { Switch } from "@/components/ui/switch";
import { getTenantPosSettings, saveTenantPosSettings, type TenantPosSettings } from "@/lib/kene/tenant-settings";
import { formatRole } from "@/lib/kene/hr-constants";
import { CommercialKitModal } from "./CommercialKitModal";

/* Porte d'hydratation: false pendant le rendu serveur + l'hydratation, true
 * ensuite — l'état actif Clair/Sombre ne s'affiche qu'une fois le thème
 * réellement lisible (règle react-hooks/set-state-in-effect: pas de setState
 * dans un effet, même approche que ThemeToggle et use-install). */
const subscribeNothing = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNothing, () => true, () => false);
}

export function SettingsSection({
  tenantId,
  tenantName,
  tenantCity,
  onNavigate,
  staffAttendance,
  onPointage,
  attendanceBusy,
}: {
  tenantId: string;
  tenantName: string;
  tenantCity?: string;
  onNavigate?: (s: ProSectionId) => void;
  staffAttendance?: { checkIn?: string | null; checkOut?: string | null; hours?: number | null } | null;
  onPointage?: (action: "in" | "out") => Promise<void>;
  attendanceBusy?: boolean;
}) {
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

  // ── Photo de vitrine & Présentation de l'établissement ──
  // Le visuel ACTUEL vient de l'annuaire public (image + hasPhoto), l'aperçu
  // local d'un upload frais prend le dessus le temps de la requête.
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [hasPhoto, setHasPhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  const [description, setDescription] = useState("");
  const [descBusy, setDescBusy] = useState(false);

  const [salonPhone, setSalonPhone] = useState("");
  const [salonAddress, setSalonAddress] = useState("");
  const [coordsBusy, setCoordsBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    apiGet<{ institutes: { id: string; image: string; hasPhoto?: boolean; description?: string }[] }>("/api/institutes")
      .then((r) => {
        if (!alive) return;
        const mine = r.institutes.find((i) => i.id === tenantId);
        if (mine) {
          setCurrentImage(mine.image);
          setHasPhoto(Boolean(mine.hasPhoto));
          if (mine.description) {
            setDescription(mine.description);
          }
        }
      })
      .catch(() => {}); // non bloquant: la carte affiche l'état vide

    apiGet<{ tenants: Array<{ id: string; phone?: string | null; address?: string | null; description?: string | null }> }>("/api/pro/tenants")
      .then((r) => {
        if (!alive) return;
        const mine = r.tenants?.find((t) => t.id === tenantId);
        if (mine) {
          if (mine.phone) setSalonPhone(mine.phone);
          if (mine.address) setSalonAddress(mine.address);
          if (mine.description && !description) setDescription(mine.description);
        }
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [tenantId]);

  async function handleSaveCoords() {
    if (!tenantId) return;
    setCoordsBusy(true);
    try {
      await apiPatch("/api/pro/tenants", {
        tenantId,
        phone: salonPhone.trim() || null,
        address: salonAddress.trim() || null,
      });
      toast.success("Coordonnées de l'établissement enregistrées 🌿", {
        description: "Le numéro WhatsApp officiel et l'adresse sont à jour pour vos clientes.",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible d'enregistrer les coordonnées");
    } finally {
      setCoordsBusy(false);
    }
  }

  async function handleSaveDescription() {
    setDescBusy(true);
    try {
      await apiPatch("/api/pro/tenants", {
        tenantId,
        description: description.trim(),
      });
      toast.success("Présentation de l'établissement mise à jour 🌿", {
        description: "Elle est désormais consultable par vos clientes sur votre fiche institut.",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible d'enregistrer la description");
    } finally {
      setDescBusy(false);
    }
  }

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
        description: "Elle personnalise la vitrine de votre institut dans l'écosystème Kènè.",
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
  const [changePhoneOpen, setChangePhoneOpen] = useState(false);
  const [changePinOpen, setChangePinOpen] = useState(false);
  const [commercialKitOpen, setCommercialKitOpen] = useState(false);

 /** Langue de l'interface — même logique que côté cliente. */
  function selectLang(l: Lang) {
    if (l === lang) return;
    setLang(l);
    const label = LANGS.find((x) => x.id === l)?.label ?? "";
    toast.success(`Interface en ${label.toLowerCase()}`);
  }

  /** Ferme la session pro : déconnexion complète et retour à l'espace invité */
  function closeSession() {
    void performLogout({ redirectUrl: "/", message: "Session institut fermée" });
  }

  return (
    <div className="max-w-2xl space-y-4">
      <SectionHeader
        title={isOwner ? "Paramètres de l'Établissement & Direction" : "Mon Espace Collaboratrice & Réglages"}
        sub={
          isOwner
            ? "Identité de l'institut, coordonnées officielles, fiscalité et abonnement"
            : "Mon compte de poste, code secret PIN, pointage du jour et préférences"
        }
        actions={
          <Badge
            variant="outline"
            className={
              isOwner
                ? "bg-gold/15 text-gold-text border-transparent font-bold"
                : "bg-primary/10 text-primary border-primary/20 font-bold"
            }
          >
            {isOwner ? "👑 Direction & Gérance" : `✨ ${sessionUser?.employeeRole ? formatRole(sessionUser.employeeRole) : "Collaboratrice"}`}
          </Badge>
        }
      />

      {/* Compte — gérante de session / collaboratrice + institut actif */}
      <div className="k-card rounded-[20px] p-4">
        <div className="flex items-center gap-3.5">
          <InitialAvatar name={managerName} className="size-12 text-[13px]" />
          <div className="min-w-0 flex-1">
            <p className="font-heading text-[15px] font-bold truncate">{managerName}</p>
            <Eyebrow className="mt-0.5">
              {isOwner ? "Fondatrice / Gérante" : (sessionUser?.employeeRole ? formatRole(sessionUser.employeeRole) : "Collaboratrice")}
            </Eyebrow>
          </div>
        </div>
        <div className="mt-3.5 grid gap-2 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-xl bg-muted/40 px-3 min-h-10 text-xs text-muted-foreground gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Phone size={13} className="shrink-0 text-gold-text" aria-hidden="true" />
              <div className="min-w-0">
                <span className="truncate font-mono font-medium text-foreground block">{managerPhone}</span>
                <span className="text-[10px] text-muted-foreground block -mt-0.5">
                  {isOwner ? "Connexion gérante (privé & confidentiel)" : "Ligne collaboratrice"}
                </span>
              </div>
            </div>
            {isOwner && (
              <button
                type="button"
                onClick={() => setChangePhoneOpen(true)}
                className="text-[11px] font-bold text-primary hover:underline shrink-0"
              >
                Changer
              </button>
            )}
          </div>
          <div className="flex items-center justify-between rounded-xl bg-muted/40 px-3 min-h-10 text-xs text-muted-foreground gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <KeyRound size={13} className="shrink-0 text-gold-text" aria-hidden="true" />
              <div className="min-w-0">
                <span className="truncate font-medium text-foreground block">Code secret PIN (4 chiffres)</span>
                <span className="text-[10px] text-muted-foreground block -mt-0.5">
                  {isOwner ? "Code gérante & caisse" : "Code de poste & validation"}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setChangePinOpen(true)}
              className="text-[11px] font-bold text-primary hover:underline shrink-0"
            >
              Modifier
            </button>
          </div>
          <p className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 min-h-10 text-xs text-muted-foreground sm:col-span-2">
            <Building2 size={13} className="shrink-0 text-gold-text" aria-hidden="true" />
            <span className="truncate">{tenantName}{tenantCity ? ` · ${tenantCity}` : ""}</span>
          </p>
        </div>
      </div>

      {/* Pointage du jour & Présence (visible pour les collaboratrices / non-gérante) */}
      {!isOwner && (
        <div className="k-card rounded-[20px] p-4 space-y-3.5 border border-primary/20 bg-gradient-to-br from-card via-background to-primary/5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <IconBadge icon={<Clock size={18} />} tone="gold" />
              <div>
                <p className="text-xs font-bold text-foreground">Mon pointage de présence du jour</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Enregistre votre heure d&apos;arrivée et de départ pour la fiche d&apos;heures.
                </p>
              </div>
            </div>
            {staffAttendance?.checkIn ? (
              staffAttendance.checkOut ? (
                <Badge variant="outline" className="bg-muted text-muted-foreground border-transparent text-[10px]">
                  Journée clôturée
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-bold">
                  En poste
                </Badge>
              )
            ) : (
              <Badge variant="outline" className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] font-bold">
                Non pointé
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
            <div className="rounded-xl bg-muted/40 p-2.5">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">Arrivée</span>
              <span className="text-xs font-mono font-bold text-foreground block mt-0.5">
                {staffAttendance?.checkIn
                  ? new Date(staffAttendance.checkIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                  : "—"}
              </span>
            </div>
            <div className="rounded-xl bg-muted/40 p-2.5">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">Départ</span>
              <span className="text-xs font-mono font-bold text-foreground block mt-0.5">
                {staffAttendance?.checkOut
                  ? new Date(staffAttendance.checkOut).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                  : "—"}
              </span>
            </div>
            <div className="rounded-xl bg-muted/40 p-2.5 col-span-2 sm:col-span-1">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">Cumul jour</span>
              <span className="text-xs font-mono font-bold text-foreground block mt-0.5">
                {staffAttendance?.hours ? `${staffAttendance.hours.toFixed(1)} h` : "—"}
              </span>
            </div>
          </div>

          {onPointage && (
            <div className="pt-1 flex gap-2">
              {!staffAttendance?.checkIn ? (
                <button
                  type="button"
                  onClick={() => void onPointage("in")}
                  disabled={attendanceBusy}
                  className="flex-1 h-10 rounded-xl k-btn-gold text-primary-foreground text-xs font-bold inline-flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-60 shadow-sm"
                >
                  {attendanceBusy ? <Loader2 size={13} className="animate-spin" /> : <LogIn size={14} />}
                  Pointer mon arrivée
                </button>
              ) : !staffAttendance?.checkOut ? (
                <button
                  type="button"
                  onClick={() => void onPointage("out")}
                  disabled={attendanceBusy}
                  className="flex-1 h-10 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs font-bold inline-flex items-center justify-center gap-1.5 active:scale-95 transition-all hover:bg-amber-500/20 disabled:opacity-60"
                >
                  {attendanceBusy ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={14} />}
                  Pointer mon départ / Fin de service
                </button>
              ) : (
                <div className="flex-1 py-2 px-3 rounded-xl bg-muted/30 border border-border/50 text-center text-xs text-muted-foreground inline-flex items-center justify-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500" /> Pointage de la journée validé
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Mes attributions & accès (visible pour les collaboratrices / non-gérante) */}
      {!isOwner && (
        <div className="k-card rounded-[20px] p-4 space-y-3">
          <div className="flex items-center gap-3">
            <IconBadge icon={<ShieldCheck size={18} />} tone="gold" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-foreground">Mes attributions &amp; modules autorisés</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                Fonctionnalités débloquées pour votre profil par la direction de l&apos;institut.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {sessionUser?.employeePermissions && sessionUser.employeePermissions.length > 0 ? (
              sessionUser.employeePermissions.map((permId) => (
                <span
                  key={permId}
                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-xl bg-primary/10 text-primary border border-primary/20 font-medium"
                >
                  <span>✨</span>
                  <span className="capitalize">{permId}</span>
                </span>
              ))
            ) : (
              <span className="text-xs text-muted-foreground italic">
                Modules attribués selon votre rôle ({sessionUser?.employeeRole ? formatRole(sessionUser.employeeRole) : "standard"}).
              </span>
            )}
          </div>
        </div>
      )}

      {/* Paramètres réservés à la fondatrice / gérante */}
      {isOwner && (
        <>
          {/* Coordonnées publiques de l'établissement (WhatsApp officiel et adresse de l'institut) */}
          <div className="k-card rounded-[20px] p-4 space-y-3">
            <div className="flex items-center gap-3">
              <IconBadge icon={<Phone size={18} />} tone="gold" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold text-foreground">Coordonnées publiques de l&apos;institut</p>
                  <span className="inline-flex items-center rounded-full bg-success/15 text-success px-2 py-0.5 text-[10px] font-bold">
                    WhatsApp &amp; Accueil
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                  Ces coordonnées sont transmises à votre clientèle pour vous contacter directement et se rendre en institut. Elles sont indépendantes de votre compte privé de gérante (aucun conflit d&apos;unicité).
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-1">
              <div>
                <label className="text-[11px] font-bold text-foreground block mb-1">
                  Numéro WhatsApp officiel de l&apos;institut (Standard clientèle)
                </label>
                <input
                  type="tel"
                  value={salonPhone}
                  onChange={(e) => setSalonPhone(e.target.value)}
                  placeholder="Ex : +225 07 00 00 00 00 ou +221 77 000 00 00"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-2 focus-visible:outline-primary"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Alimente le bouton d&apos;échange WhatsApp et les rappels de rendez-vous de l&apos;établissement.
                </p>
              </div>

              <div>
                <label className="text-[11px] font-bold text-foreground block mb-1">
                  Adresse physique &amp; quartier de l&apos;institut
                </label>
                <input
                  type="text"
                  value={salonAddress}
                  onChange={(e) => setSalonAddress(e.target.value)}
                  placeholder="Ex : Rue des Jardins, Cocody Deux Plateaux Vallon, Abidjan"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-2 focus-visible:outline-primary"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Affichée sur les confirmations de RDV et le plan d&apos;accès de vos clientes.
                </p>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleSaveCoords}
                  disabled={coordsBusy}
                  className="h-9 px-4 rounded-xl k-btn-gold text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60 shadow-sm"
                >
                  {coordsBusy ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />}
                  Enregistrer les coordonnées
                </button>
              </div>
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

          {/* Présentation de l'établissement — description visible côté cliente */}
          <div className="k-card rounded-[20px] p-4 space-y-3">
            <div className="flex items-center gap-3">
              <IconBadge icon={<Sparkles size={18} />} tone="gold" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold text-foreground">Présentation &amp; Savoir-faire</p>
                  <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-bold">
                    Visible côté client
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                  Décrivez l&apos;histoire, les rituels signature et l&apos;expertise de {tenantName}. Vos clientes la découvriront lors de la réservation.
                </p>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={600}
                rows={4}
                placeholder="Ex : Institut dermo-cosmétique de référence à Cocody. Rituels éclat anti-taches, gommages régénérants au beurre de karité brut de Korhogo, bilans de peau haute précision..."
                className="w-full rounded-xl border border-border bg-background p-3 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-2 focus-visible:outline-primary resize-none"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-foreground">
                  {description.length} / 600 caractères
                </span>
                <button
                  type="button"
                  onClick={handleSaveDescription}
                  disabled={descBusy}
                  className="h-9 px-4 rounded-xl k-btn-gold text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60 shadow-sm"
                >
                  {descBusy ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />}
                  Enregistrer la présentation
                </button>
              </div>
            </div>
          </div>
        </>
      )}

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

      {/* Kit Commercial & Chevalet Cabine — réservé à la direction / gérante */}
      {isOwner && (
        <div className="k-card rounded-[20px] p-2 border border-gold/30 shadow-xs">
          <button
            type="button"
            onClick={() => setCommercialKitOpen(true)}
            className="w-full flex items-center gap-3 rounded-[14px] p-2.5 text-left active:scale-[0.99] transition-transform focus-visible:outline-2 focus-visible:outline-primary"
          >
            <IconBadge icon={<Sparkles size={18} />} tone="gold" />
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-2">
                <span className="text-xs font-bold text-foreground">Kit Commercial &amp; Chevalet Cabine</span>
                <span className="rounded-full bg-gold/15 text-gold-text px-2 py-0.5 text-[9px] font-bold">Outils Salon</span>
              </span>
              <span className="block text-[11px] text-muted-foreground mt-0.5">
                Affichette QR code imprimable, scripts d&apos;accueil et guide d&apos;aide à la vente
              </span>
            </span>
            <ChevronRight size={16} className="text-muted-foreground shrink-0" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Abonnement & facturation — réservé à la direction / gérante */}
      {isOwner && (
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
      )}

      {/* Espace Beauté personnel (bilan dermo-biométrique, Dermo Kènè & soins) */}
      <div className="k-card rounded-[20px] p-4 bg-gradient-to-br from-primary/5 via-card to-gold/5 border border-primary/20">
        <div className="flex items-center gap-3">
          <IconBadge icon={<DuafeIcon size={18} />} tone="gold" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold">Mon Espace Beauté personnel</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
              Accède à ton espace beauté personnel : bilan dermo-biométrique, Dermo Kènè, soins et rituels.
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

      {/* Session */}
      <div className="k-card rounded-[20px] p-4">
        <div className="flex items-center gap-3">
          <IconBadge icon={<LogOut size={18} />} tone="bissap" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold">Session de travail</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
              {isOwner
                ? "Ferme la session de cet appareil — tu te reconnecteras avec ton numéro gérante."
                : "Ferme la session de ton poste — tu te reconnecteras avec ton numéro de collaboratrice et ton code PIN."}
            </p>
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

      <ChangePhoneModal
        open={changePhoneOpen}
        onOpenChange={setChangePhoneOpen}
        currentPhone={sessionUser?.phone || ""}
      />

      <ChangePinModal
        open={changePinOpen}
        onOpenChange={setChangePinOpen}
        currentPhone={sessionUser?.phone || ""}
        hasPin={sessionUser?.hasPin}
      />

      <CommercialKitModal
        open={commercialKitOpen}
        onOpenChange={setCommercialKitOpen}
        tenantId={tenantId}
        tenantName={tenantName}
        tenantCity={tenantCity}
      />
    </div>
  );
}
