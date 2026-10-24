"use client";
// Kènè — Trousseau Matériel & Autorisations Téléphone Unifiées (2026)
// Permet d'accorder une seule fois pour toutes les autorisations matérielles
// (Caméra, Microphone, Localisation, Notifications) sans aucune redemande ultérieure.

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  Camera,
  Mic,
  MapPin,
  Bell,
  ShieldCheck,
  Smartphone,
  Check,
  AlertCircle,
  X,
  Sparkles,
  Loader2,
  Lock,
  ArrowRight,
  Info,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import { useKene } from "@/store/kene";
import {
  isHardwarePermGranted,
  queryFeaturePermission,
  requestAllHardwarePermissionsOnce,
  subscribeHardwarePerm,
  getPersistentCameraStream,
  pausePersistentCameraStream,
  getPersistentAudioStream,
  pausePersistentAudioStream,
  getPersistentGeolocation,
  requestPersistentNotification,
  isIOSDevice,
  isAndroidDevice,
  isPWAInstalled,
  type HardwareFeature,
  type PermState,
} from "@/lib/kene/hardware-perm";
import { useInstallPrompt } from "@/components/kene/pwa/use-install";

interface HardwarePermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  triggerFeature?: HardwareFeature;
}

export function HardwarePermissionsModal({
  isOpen,
  onClose,
  triggerFeature,
}: HardwarePermissionsModalProps) {
  const { user } = useKene();
  const { canInstall, install } = useInstallPrompt();

  const [busy, setBusy] = useState(false);
  const [activeItem, setActiveItem] = useState<HardwareFeature | null>(triggerFeature ?? null);

  // Synchronisation dynamique avec le store de permissions externes
  useSyncExternalStore(subscribeHardwarePerm, () => "version", () => "version");

  const [permStates, setPermStates] = useState<Record<HardwareFeature, PermState>>({
    camera: "prompt",
    mic: "prompt",
    geo: "prompt",
    notifications: "prompt",
  });

  const refreshPerms = async () => {
    const [c, m, g, n] = await Promise.all([
      queryFeaturePermission("camera"),
      queryFeaturePermission("mic"),
      queryFeaturePermission("geo"),
      queryFeaturePermission("notifications"),
    ]);
    setPermStates({ camera: c, mic: m, geo: g, notifications: n });
  };

  useEffect(() => {
    if (isOpen) {
      void refreshPerms();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isIOS = isIOSDevice();
  const isAndroid = isAndroidDevice();
  const isPWA = isPWAInstalled();

  const allGranted =
    (permStates.camera === "granted" || isHardwarePermGranted("camera")) &&
    (permStates.mic === "granted" || isHardwarePermGranted("mic")) &&
    (permStates.geo === "granted" || isHardwarePermGranted("geo")) &&
    (permStates.notifications === "granted" || isHardwarePermGranted("notifications"));

  // Action maîtresse : Tout autoriser en 1 clic
  async function handleGrantAll() {
    setBusy(true);
    haptic(HAPTIC.medium);
    try {
      const res = await requestAllHardwarePermissionsOnce(user?.id);
      await refreshPerms();

      if (res.camera && res.mic) {
        haptic(HAPTIC.success);
        toast.success("Autorisations enregistrées avec succès !", {
          description: "Votre téléphone a mémorisé vos accès pour la caméra, le micro et vos capteurs.",
        });
      } else {
        toast.info("Autorisations partiellement mises à jour", {
          description: "Certains capteurs nécessitent une confirmation spécifique dans le navigateur.",
        });
      }
    } catch {
      toast.error("Impossible d'activer les autorisations matérielles");
    } finally {
      setBusy(false);
    }
  }

  // Action individuelle : Activer un seul capteur
  async function handleGrantSingle(feature: HardwareFeature) {
    setActiveItem(feature);
    haptic(HAPTIC.light);
    try {
      if (feature === "camera") {
        await getPersistentCameraStream("user");
        pausePersistentCameraStream();
        toast.success("Appareil photo autorisé à vie 📸");
      } else if (feature === "mic") {
        await getPersistentAudioStream();
        pausePersistentAudioStream();
        toast.success("Microphone autorisé à vie 🎙️");
      } else if (feature === "geo") {
        await getPersistentGeolocation();
        toast.success("Position géographique autorisée 📍");
      } else if (feature === "notifications") {
        const res = await requestPersistentNotification();
        if (res === "granted") toast.success("Notifications activées 🔔");
        else toast.info("Notifications refusées dans le navigateur");
      }
      await refreshPerms();
    } catch (err: any) {
      const isDenied = err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError";
      if (isDenied) {
        toast.error("Accès bloqué par votre navigateur", {
          description: "Vérifiez les paramètres de sécurité (icône cadenas ou réglages Safari).",
        });
      } else {
        toast.error("Capteur temporairement indisponible");
      }
    } finally {
      setActiveItem(null);
    }
  }

  const items = [
    {
      id: "camera" as HardwareFeature,
      title: "Appareil Photo / Caméra HD",
      subtitle: "Selfie cutané IA, suivi multi-angles 360° et scan d'ingrédients INCI",
      icon: Camera,
      color: "text-amber-500 bg-amber-500/10 border-amber-500/30",
      granted: permStates.camera === "granted" || isHardwarePermGranted("camera"),
    },
    {
      id: "mic" as HardwareFeature,
      title: "Microphone & Écoute Vocale",
      subtitle: "Dialogue oral bienveillant avec Dermo Kènè et dictée sans les mains",
      icon: Mic,
      color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30",
      granted: permStates.mic === "granted" || isHardwarePermGranted("mic"),
    },
    {
      id: "geo" as HardwareFeature,
      title: "Localisation Précise (GPS)",
      subtitle: "Instituts partenaires et dermo-conseillères à proximité & livraisons",
      icon: MapPin,
      color: "text-sky-500 bg-sky-500/10 border-sky-500/30",
      granted: permStates.geo === "granted" || isHardwarePermGranted("geo"),
    },
    {
      id: "notifications" as HardwareFeature,
      title: "Notifications & Alertes de Santé",
      subtitle: "Rappels de soins (Le Fil du Retour), suivi de RDV et alertes de compte",
      icon: Bell,
      color: "text-violet-500 bg-violet-500/10 border-violet-500/30",
      granted: permStates.notifications === "granted" || isHardwarePermGranted("notifications"),
    },
  ];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg rounded-t-[32px] sm:rounded-[32px] border border-border/80 bg-background/95 dark:bg-[#14100C]/95 backdrop-blur-2xl p-5 sm:p-6 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
        role="dialog"
        aria-labelledby="perm-hub-title"
      >
        {/* En-tête */}
        <div className="flex items-center justify-between pb-3 border-b border-border/60">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-primary/15 text-primary border border-primary/30 shadow-xs">
              <Smartphone size={22} />
            </span>
            <div>
              <h3 id="perm-hub-title" className="font-heading font-black text-base text-foreground leading-tight">
                Autorisations du Téléphone
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Accorder une seule fois pour tout sans redemande
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-9 rounded-full bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground grid place-items-center active:scale-95 transition-all"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Corps défilable */}
        <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1 text-xs">
          {/* Bannière de réassurance */}
          <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-gold/10 to-transparent p-4 flex flex-col gap-2.5 shadow-xs">
            <div className="flex items-start gap-2.5">
              <Sparkles className="size-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="font-heading font-black text-[13px] text-foreground leading-snug">
                  Zéro question répétée · Décision mémorisée à vie
                </p>
                <p className="text-[11.5px] text-muted-foreground leading-relaxed mt-1">
                  En autorisant vos matériels maintenant, Kènè configure votre navigateur et votre smartphone pour que vous puissiez scanner votre peau, parler à Dermo Kènè et localiser les salons partenaires en toute fluidité.
                </p>
              </div>
            </div>

            {/* Bouton Maître : Tout autoriser */}
            <button
              type="button"
              onClick={handleGrantAll}
              disabled={busy}
              className="mt-1 w-full h-12 rounded-2xl bg-gradient-to-r from-[#C8951E] via-[#E2B755] to-[#B07E12] hover:brightness-105 active:scale-[0.98] text-[#14100C] font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50 cursor-pointer"
            >
              {busy ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Configuration du téléphone en cours…</span>
                </>
              ) : allGranted ? (
                <>
                  <Check size={18} className="stroke-[3]" />
                  <span>Tous les matériels sont déjà autorisés ✔</span>
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  <span>✨ Tout autoriser en 1 clic (Recommandé)</span>
                </>
              )}
            </button>
          </div>

          {/* Liste détaillée des 4 capteurs */}
          <div className="space-y-2.5">
            <p className="font-heading font-black text-[11px] uppercase tracking-wider text-muted-foreground px-1">
              État individuel des capteurs
            </p>

            {items.map((it) => {
              const IconComp = it.icon;
              const isItemBusy = busy || activeItem === it.id;

              return (
                <div
                  key={it.id}
                  className="rounded-2xl border border-border/80 bg-card/60 p-3.5 flex items-center justify-between gap-3 shadow-2xs hover:border-primary/40 transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`grid size-10 place-items-center rounded-xl border shrink-0 ${it.color}`}>
                      <IconComp size={18} />
                    </span>
                    <div className="min-w-0">
                      <p className="font-heading font-bold text-xs text-foreground truncate">
                        {it.title}
                      </p>
                      <p className="text-[10.5px] text-muted-foreground leading-tight line-clamp-1 mt-0.5">
                        {it.subtitle}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {it.granted ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-black text-[11px]">
                        <Check size={12} className="stroke-[3]" />
                        <span>Autorisé</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleGrantSingle(it.id)}
                        disabled={isItemBusy}
                        className="h-8.5 px-3 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 font-bold text-xs inline-flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                      >
                        {isItemBusy ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <span>Activer</span>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Guide spécifique pour ne plus jamais avoir de pop-up selon le smartphone */}
          <div className="rounded-2xl border border-border/70 bg-muted/30 p-3.5 space-y-2 text-[11px]">
            <p className="font-heading font-bold text-foreground flex items-center gap-1.5">
              <Info size={14} className="text-primary" />
              <span>Garantie « Ne plus me demander à chaque fois »</span>
            </p>

            {isIOS && !isPWA && (
              <div className="space-y-2 pt-1 border-t border-border/40">
                <p className="text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">Sur iPhone (Safari) :</strong> Apple réinitialise la caméra à chaque visite dans un onglet standard. Pour que votre iPhone s&apos;en souvienne <strong>à vie</strong> sans jamais reposer la question :
                </p>
                <div className="rounded-xl bg-background/80 border border-border/60 p-2.5 space-y-1.5 text-foreground/90">
                  <p>1. Touchez le bouton de partage Safari <strong className="text-primary">⎋ (en bas)</strong>.</p>
                  <p>2. Choisissez <strong className="text-primary">« Sur l&apos;écran d&apos;accueil »</strong> pour installer Kènè.</p>
                  <p className="text-[10px] text-muted-foreground">→ Une fois installée sur votre écran d&apos;accueil, Safari n&apos;affiche plus aucun message.</p>
                </div>
                {canInstall && (
                  <button
                    type="button"
                    onClick={() => void install()}
                    className="w-full h-9 rounded-xl bg-primary text-primary-foreground font-black text-xs inline-flex items-center justify-center gap-1.5"
                  >
                    <span>Ajouter Kènè à l&apos;écran d&apos;accueil maintenant</span>
                  </button>
                )}
              </div>
            )}

            {isAndroid && (
              <div className="space-y-1.5 pt-1 border-t border-border/40 text-muted-foreground leading-relaxed">
                <p>
                  <strong className="text-foreground">Sur Android (Google Chrome) :</strong> Lorsque la boîte de dialogue de votre téléphone s&apos;ouvre, sélectionnez impérativement :
                </p>
                <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-2 text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-2">
                  <Check size={15} />
                  <span>« Lorsque vous utilisez l&apos;application »</span>
                </div>
                <p className="text-[10.5px]">
                  (Évitez « Uniquement cette fois » qui force Chrome à redemander lors de chaque session).
                </p>
              </div>
            )}

            {!isIOS && !isAndroid && (
              <p className="text-muted-foreground leading-relaxed">
                Votre navigateur mémorise automatiquement les autorisations accordées. Vous pouvez les gérer à tout moment en cliquant sur le cadenas 🔒 à gauche de l&apos;URL.
              </p>
            )}
          </div>

          {/* Garantie de discrétion & Chiffrement médical */}
          <div className="flex items-center gap-2 text-[10.5px] text-muted-foreground px-1 py-1">
            <ShieldCheck size={14} className="text-emerald-500 shrink-0" />
            <span>Chiffrement médical de bout en bout · Zéro écoute passive en arrière-plan</span>
          </div>
        </div>

        {/* Pied de modal */}
        <div className="pt-3 border-t border-border/60 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-11 px-5 rounded-2xl border border-border bg-card hover:bg-muted/40 font-bold text-xs text-foreground active:scale-95 transition-all"
          >
            Fermer
          </button>

          <button
            type="button"
            onClick={() => {
              void handleGrantAll().then(() => onClose());
            }}
            className="h-11 flex-1 rounded-2xl bg-primary text-primary-foreground font-black text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-md"
          >
            <span>Confirmer &amp; Enregistrer</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
