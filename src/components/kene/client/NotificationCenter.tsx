"use client";
// Kènè Cliente — Centre de notifications: cloche (badge non-lus) + Sheet
// « À venir » (rappels programmés) / « Reçues » (envoyées, état lu/non lue)
// + « Tout marquer comme lu » (POST /api/notifications/read).
// TEMPS RÉEL: socket.io vers le mini-service notify-service
// (?XTransformPort=3004) — le fil arrive en PUSH (event `feed`): badge, liste
// et toast d'arrivée se mettent à jour SANS reload pendant que l'app est ouverte.
// Dégradation douce: sans service, le comportement historique (GET au montage
// + à l'ouverture) reste intact.
// WEB PUSH: carte « Rappels sur mon téléphone » en bas du Sheet —
// abonnement Push API (VAPID) via le service worker: les rappels arrivent
// en notification système MÊME application fermée.
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { io, type Socket } from "socket.io-client";
import { armHeartbeat } from "@/lib/kene/live-socket";
import {
  ArrowRight,
  Bell,
  BellRing,
  CalendarDays,
  CheckCheck,
  CheckCircle2,
  Crown,
  Leaf,
  Loader2,
  ScanFace,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { apiGet, apiPost } from "@/lib/kene/api";
import { getActivePushSubscription, getPushStatus, pushKeyToBase64, subscribeToPush, type PushStatus } from "@/lib/kene/push-client";
import { channelLabel, humanWhen, readMeta } from "@/lib/kene/reminders";
import { cn } from "@/lib/utils";
import type { ApiReminderFeed, ApiReminder } from "./types";
import { requestPersistentNotification } from "@/lib/kene/hardware-perm";
import { useKene, type ClientTab } from "@/store/kene";
import type { BodyZone } from "@/lib/kene/types";
import { HAPTIC, haptic } from "@/lib/kene/ux";

const NOTIFY_PORT = 3004;

function looksLikeFeed(f: unknown): f is ApiReminderFeed {
  const x = f as Partial<ApiReminderFeed> | null;
  return !!x && typeof x.unread === "number" && Array.isArray(x.sent) && Array.isArray(x.scheduled);
}

function excerpt(s: string, max = 70): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

interface NotifPresentation {
  categoryLabel: string;
  actionLabel: string;
  targetTab: ClientTab;
  targetZone?: BodyZone;
  Icon: typeof BellRing;
  iconBoxClass: string;
  badgeClass: string;
  channelDisplay: string;
}

function classifyNotification(item: ApiReminder): NotifPresentation {
  const meta = readMeta(item.metaJson);
  const msg = (item.message || "").toLowerCase();

  // Détection de la zone si mentionnée dans le message
  let detectedZone: BodyZone | undefined;
  if (msg.includes("visage")) detectedZone = "visage";
  else if (msg.includes("dos")) detectedZone = "dos";
  else if (msg.includes("cuir chevelu")) detectedZone = "cuir_chevelu";
  else if (msg.includes("mains")) detectedZone = "mains";
  else if (msg.includes("barbe")) detectedZone = "barbe";

  // 1) Diagnostic / Contrôle S+3 / Protocole cutané
  if (meta.diagId || msg.includes("diagnostic") || msg.includes("protocole") || msg.includes("bilan") || msg.includes("score")) {
    const isRescanPrompt = item.status === "scheduled" || msg.includes("refais") || msg.includes("3 semaines");
    return {
      categoryLabel: isRescanPrompt ? "Contrôle Évolution S+3" : "Bilan Cutané IA",
      actionLabel: isRescanPrompt ? "Lancer mon scan de suivi" : "Ouvrir mon Dossier Peau",
      targetTab: isRescanPrompt ? "diagnostic" : "dossier",
      targetZone: detectedZone,
      Icon: ScanFace,
      iconBoxClass: "bg-gold/15 text-gold-text border border-gold/30",
      badgeClass: "bg-gold/15 text-gold-text border border-gold/30",
      channelDisplay: "Suivi Dermo Kènè",
    };
  }

  // 2) Rendez-vous en institut (J-1 ou confirmation)
  if (meta.apptId || msg.includes("rappel :") || msg.includes("institut") || msg.includes("rdv") || msg.includes("soin")) {
    return {
      categoryLabel: "Rendez-vous Institut",
      actionLabel: "Voir mes Soins & RDV",
      targetTab: "agenda",
      Icon: CalendarDays,
      iconBoxClass: "bg-[#2E6F40]/15 text-[#2E6F40] border border-[#2E6F40]/30",
      badgeClass: "bg-[#2E6F40]/15 text-[#2E6F40] border border-[#2E6F40]/30",
      channelDisplay: "Agenda Cabine",
    };
  }

  // 3) Abonnement Kènè+ (J-3 ou renouvellement)
  if (meta.dedupKey?.startsWith("sub:") || msg.includes("abonnement") || msg.includes("kènè+")) {
    return {
      categoryLabel: "Abonnement Kènè+",
      actionLabel: "Gérer mon abonnement",
      targetTab: "abonnement",
      Icon: Crown,
      iconBoxClass: "bg-primary/15 text-primary border border-primary/30",
      badgeClass: "bg-primary/12 text-primary border border-primary/25",
      channelDisplay: "Espace Kènè+",
    };
  }

  // 4) Routine / Conseil botanique par défaut
  return {
    categoryLabel: "Conseil & Routine",
    actionLabel: "Consulter Dermo Kènè",
    targetTab: "accueil",
    Icon: Leaf,
    iconBoxClass: "bg-primary/15 text-primary border border-primary/25",
    badgeClass: "bg-primary/10 text-primary",
    channelDisplay: item.channel === "whatsapp" ? "Notification Kènè" : channelLabel(item.channel),
  };
}

/** Déclenche une notification système native sur Android/iOS via le Service Worker si autorisé */
async function triggerNativeNotification(title: string, body: string) {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && typeof reg.showNotification === "function") {
        await reg.showNotification(title, {
          body,
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          tag: `kene-notif-${Date.now()}`,
        });
        return;
      }
    }
    new Notification(title, { body, icon: "/icons/icon-192.png" });
  } catch {
    // silencieux si bloqué par l'OS
  }
}

export function NotificationCenter({
  userId,
  onLiveFeed,
  onNavigate,
  className,
}: {
  userId: string;
  /** Appelé à chaque fil reçu en temps réel (badge + liste à jour) */
  onLiveFeed?: (feed: ApiReminderFeed) => void;
  /** Navigation directe en 1 tap vers l'écran cible de la notification */
  onNavigate?: (tab: ClientTab, zone?: BodyZone) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState<ApiReminderFeed | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  // Conserve les IDs qui étaient non-lus à l'ouverture du tiroir pour garder le badge "Nouveau" visible pendant la lecture
  const [sessionFreshIds, setSessionFreshIds] = useState<Set<string>>(new Set());
  // Web Push: "checking" le temps de lire permission + abonnement réels,
  // puis "on" | "off" | "unsupported" (navigateur sans service worker/PushManager).
  const [pushStatus, setPushStatus] = useState<PushStatus | "checking">("checking");
  const [pushBusy, setPushBusy] = useState(false);

  const unread = feed?.unread ?? 0;

  // Refs stables pour les callbacks socket (identité des props sans importance)
  const socketRef = useRef<Socket | null>(null);
  const openRef = useRef(false);
  const prevUnreadRef = useRef<number | null>(null); // null = pas encore de fil → pas de toast
  const onLiveFeedRef = useRef<((f: ApiReminderFeed) => void) | undefined>(undefined);
  onLiveFeedRef.current = onLiveFeed;

  const load = useCallback(
    async (showSpinner: boolean) => {
      if (showSpinner) setLoading(true);
      try {
        const f = await apiGet<Partial<ApiReminderFeed>>(`/api/notifications?userId=${userId}`);
        const safeFeed: ApiReminderFeed = {
          unread: typeof f?.unread === "number" ? f.unread : 0,
          created: typeof f?.created === "number" ? f.created : 0,
          sent: Array.isArray(f?.sent) ? f.sent : [],
          scheduled: Array.isArray(f?.scheduled) ? f.scheduled : [],
        };
        setFeed(safeFeed);
        prevUnreadRef.current = safeFeed.unread;
        setErr(null);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Chargement impossible");
      } finally {
        if (showSpinner) setLoading(false);
      }
    },
    [userId]
  );

  // Badge au montage (silencieux — la cloche dégrade proprement en cas d'erreur)
  useEffect(() => {
    void load(false);
  }, [load]);

  // Web Push: état réel au montage (support navigateur + permission +
  // abonnement actif) — la carte du Sheet se cale dessus, jamais sur un état deviné.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = await getPushStatus();
      if (!cancelled) setPushStatus(s);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ── Temps réel: connexion au notify-service ──────────────────
   * io('/?XTransformPort=3004'): la gateway route vers le mini-service.
   * Une seule socket par onglet, partagée badge + Sheet + carte accueil. */
  useEffect(() => {
    // Never use PORT in the URL, always use XTransformPort
    // DO NOT change the path, it is used by Caddy to forward the request to the correct port
    const socket = io(`/?XTransformPort=${NOTIFY_PORT}`, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 4_000,
      timeout: 8_000,
    });
    socketRef.current = socket;

    const disarm = armHeartbeat(socket);

    socket.on("connect", () => {
      setLive(true);
      socket.emit("join", { userId });
    });
    socket.on("disconnect", () => setLive(false));
    socket.on("feed", (f: unknown) => {
      if (!looksLikeFeed(f)) return;
      setFeed(f);
      // Toast interactif + Notification système Android si nouvelle non-lue
      const prev = prevUnreadRef.current;
      if (prev !== null && f.unread > prev && !openRef.current) {
        const first = f.sent.find((n) => !n.readAt);
        const bodyText = first ? excerpt(first.message, 90) : `${f.unread} notification${f.unread > 1 ? "s" : ""} non lue${f.unread > 1 ? "s" : ""}.`;
        haptic(HAPTIC.light);
        toast("Nouvelle notification Kènè", {
          description: bodyText,
          action: first
            ? {
                label: "Voir",
                onClick: () => {
                  const info = classifyNotification(first);
                  if (onNavigate) onNavigate(info.targetTab, info.targetZone);
                  else useKene.getState().setClientTab(info.targetTab);
                },
              }
            : undefined,
        });
        void triggerNativeNotification("Kènè — Suivi Cutané", bodyText);
      }
      prevUnreadRef.current = f.unread;
      onLiveFeedRef.current?.(f);
    });

    return () => {
      disarm();
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setLive(false);
    };
  }, [userId, onNavigate]);

  // Anti-fatigue du badge "9+" : quand l'utilisatrice ouvre le panneau de notifications,
  // on mémorise les cartes "Nouveau" pour l'affichage visuel et on éteint automatiquement
  // le compteur global après 1,5 seconde de lecture.
  useEffect(() => {
    if (!open || !feed || feed.unread === 0) return;
    const unreadIds = (feed.sent ?? []).filter((n) => !n.readAt).map((n) => n.id);
    if (unreadIds.length > 0) {
      setSessionFreshIds((prev) => {
        const next = new Set(prev);
        unreadIds.forEach((id) => next.add(id));
        return next;
      });
    }
    const timer = window.setTimeout(async () => {
      try {
        await apiPost<{ ok: boolean; updated: number }>("/api/notifications/read", { userId });
        setFeed((f) =>
          f
            ? { ...f, unread: 0, sent: f.sent.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) }
            : f
        );
        prevUnreadRef.current = 0;
        socketRef.current?.emit("read-all", { userId });
      } catch {
        // silencieux
      }
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [open, feed, userId]);

  function onOpenChange(o: boolean) {
    setOpen(o);
    openRef.current = o;
    if (o) {
      void load(true);
    } else {
      setSessionFreshIds(new Set());
    }
  }

  async function markAllRead() {
    if (busy || unread === 0) return;
    setBusy(true);
    try {
      const r = await apiPost<{ ok: boolean; updated: number }>("/api/notifications/read", { userId });
      setFeed((f) =>
        f
          ? { ...f, unread: 0, sent: f.sent.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) }
          : f
      );
      prevUnreadRef.current = 0;
      setSessionFreshIds(new Set());
      socketRef.current?.emit("read-all", { userId });
      toast.success("Tout est lu", { description: `${r.updated} notification${r.updated > 1 ? "s" : ""} marquée${r.updated > 1 ? "s" : ""} comme lue${r.updated > 1 ? "s" : ""}.` });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible de marquer comme lu");
    } finally {
      setBusy(false);
    }
  }

  async function handleNotificationClick(item: ApiReminder) {
    haptic(HAPTIC.tap);
    const info = classifyNotification(item);

    // Si non lue, marquer individuellement comme lue
    if (!item.readAt && item.status === "sent") {
      setFeed((f) =>
        f
          ? {
              ...f,
              unread: Math.max(0, f.unread - 1),
              sent: f.sent.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n)),
            }
          : f
      );
      void apiPost("/api/notifications/read", { userId, ids: [item.id] }).catch(() => undefined);
    }

    onOpenChange(false);
    if (onNavigate) {
      onNavigate(info.targetTab, info.targetZone);
    } else {
      useKene.getState().setClientTab(info.targetTab);
    }
  }

  /* ── Web Push: activation des rappels téléphone ─────────────── */
  async function enablePush() {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      const perm = await requestPersistentNotification();
      if (perm !== "granted") {
        setPushStatus("off");
        toast.error("Autorisation refusée dans les réglages du navigateur");
        return;
      }
      const { publicKey } = await apiGet<{ publicKey: string | null }>("/api/push/public-key");
      if (!publicKey) {
        setPushStatus("off");
        toast.error("Notifications indisponibles");
        return;
      }
      const sub = await subscribeToPush(publicKey);
      await apiPost<{ ok: boolean }>("/api/push/subscribe", {
        userId,
        subscription: {
          endpoint: sub.endpoint,
          keys: { p256dh: pushKeyToBase64(sub.getKey("p256dh")), auth: pushKeyToBase64(sub.getKey("auth")) },
        },
      });
      setPushStatus("on");
      toast.success("Rappels activés — tu seras prévenue même app fermée 💛");
    } catch (e) {
      setPushStatus("off");
      toast.error(e instanceof Error ? e.message : "Activation impossible");
    } finally {
      setPushBusy(false);
    }
  }

  async function disablePush() {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      const sub = await getActivePushSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe().catch(() => undefined);
        await apiPost<{ ok: boolean }>("/api/push/unsubscribe", { endpoint });
      }
      setPushStatus("off");
      toast("Rappels désactivés");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Désactivation impossible");
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => onOpenChange(true)}
        aria-label={unread > 0 ? `Notifications — ${unread} non lue${unread > 1 ? "s" : ""}` : "Notifications"}
        className={cn(
          "relative h-8 w-8 sm:h-9 sm:w-9 shrink-0 grid place-items-center rounded-full bg-card border border-border text-foreground shadow-sm active:scale-95 transition-transform focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
          className
        )}
      >
        <Bell className="size-3.5 sm:size-4" strokeWidth={1.9} aria-hidden="true" />
        {unread > 0 && (
          <span
            role="status"
            aria-live="polite"
            className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-[#8B1A3B] text-[#FFF9EC] text-[9px] font-black grid place-items-center ring-2 ring-background"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="max-w-[560px] mx-auto rounded-t-3xl max-h-[85vh] flex flex-col"
        >
          <SheetHeader className="text-left shrink-0 pb-2">
            <div className="flex items-center justify-between gap-2 pr-6">
              <SheetTitle className="font-heading font-black flex items-center gap-2 flex-wrap">
                <BellRing size={18} className="text-primary" aria-hidden="true" /> Centre de Notifications
                {live && (
                  <span
                    title="Connectée en temps réel"
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#3F7D3F]/10 text-[#3F7D3F] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                  >
                    <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3F7D3D] opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#3F7D3F]" />
                    </span>
                    En direct
                  </span>
                )}
              </SheetTitle>
              {(unread > 0 || sessionFreshIds.size > 0) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={markAllRead}
                  disabled={busy}
                  className="gap-1 h-8 px-2.5 text-[11px] rounded-full shrink-0"
                >
                  <CheckCheck size={13} aria-hidden="true" />
                  <span>Tout lu</span>
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Appuie sur une notification pour ouvrir directement ton bilan, ton scanner ou ton rendez-vous.
            </p>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto pretty-scroll px-4 pb-4 space-y-4">
            {loading && !feed ? (
              <div className="space-y-2.5 pt-2">
                <Skeleton className="h-[88px] rounded-2xl" />
                <Skeleton className="h-[88px] rounded-2xl" />
                <Skeleton className="h-[88px] rounded-2xl" />
              </div>
            ) : err && !feed ? (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-center">
                <p className="text-xs text-destructive">{err}</p>
                <Button variant="outline" className="mt-2 min-h-10 px-4" onClick={() => void load(true)}>
                  Réessayer
                </Button>
              </div>
            ) : !feed || ((feed.scheduled?.length ?? 0) === 0 && (feed.sent?.length ?? 0) === 0) ? (
              <div className="rounded-2xl border border-dashed border-border bg-card/60 p-5 text-center">
                <BellRing size={22} className="mx-auto text-primary" aria-hidden="true" />
                <p className="mt-2 text-xs font-semibold">Aucune notification pour l&apos;instant</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Tes rappels s&apos;activent tout seuls : contrôle 3 semaines après un scan, rappel J-1 avant chaque RDV.
                </p>
              </div>
            ) : (
              <>
                {/* ── Prochaines étapes programmées (À venir) ── */}
                {(feed.scheduled?.length ?? 0) > 0 && (
                  <section aria-labelledby="nc-upcoming" className="pt-1">
                    <p id="nc-upcoming" className="text-[10px] uppercase tracking-[0.14em] font-bold text-[#2E6F40] mb-2">
                      Prochaines étapes programmées ({feed.scheduled?.length ?? 0})
                    </p>
                    <ul className="space-y-2.5">
                      {feed.scheduled?.map((m) => {
                        const info = classifyNotification(m);
                        const ItemIcon = info.Icon;
                        return (
                          <li key={m.id}>
                            <button
                              type="button"
                              onClick={() => void handleNotificationClick(m)}
                              className="w-full text-left flex items-start gap-3 rounded-2xl border border-[#2E6F40]/30 bg-[#2E6F40]/[0.05] hover:bg-[#2E6F40]/[0.1] active:scale-[0.99] transition-all p-3.5 cursor-pointer"
                            >
                              <span className={cn("grid place-items-center h-9 w-9 rounded-xl shrink-0", info.iconBoxClass)}>
                                <ItemIcon size={16} aria-hidden="true" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide", info.badgeClass)}>
                                    {info.categoryLabel}
                                  </span>
                                  <span className="text-[10px] font-semibold text-[#2E6F40]">
                                    {m.scheduledAt ? humanWhen(m.scheduledAt) : "À venir"}
                                  </span>
                                </div>
                                <p className="text-xs leading-relaxed text-foreground/90">{m.message}</p>
                                <div className="mt-2 flex items-center justify-between gap-2">
                                  <span className="text-[10px] text-muted-foreground">{info.channelDisplay}</span>
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-primary">
                                    {info.actionLabel} <ArrowRight size={12} />
                                  </span>
                                </div>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}

                {/* ── Notifications reçues ── */}
                {(feed.sent?.length ?? 0) > 0 && (
                  <section aria-labelledby="nc-sent">
                    <p id="nc-sent" className="text-[10px] uppercase tracking-[0.14em] font-bold text-muted-foreground mb-2">
                      Reçues récemment ({feed.sent?.length ?? 0})
                    </p>
                    <ul className="space-y-2.5">
                      <AnimatePresence initial={false}>
                        {feed.sent?.map((m) => {
                          const isUnread = !m.readAt || sessionFreshIds.has(m.id);
                          const info = classifyNotification(m);
                          const ItemIcon = info.Icon;
                          return (
                            <motion.li
                              key={m.id}
                              layout
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -6 }}
                            >
                              <button
                                type="button"
                                onClick={() => void handleNotificationClick(m)}
                                className={cn(
                                  "w-full text-left flex items-start gap-3 rounded-2xl border p-3.5 transition-all hover:border-primary/40 active:scale-[0.99] cursor-pointer",
                                  isUnread ? "border-primary/35 bg-primary/[0.06] shadow-xs" : "border-border bg-card"
                                )}
                              >
                                <span
                                  className={cn(
                                    "grid place-items-center h-9 w-9 rounded-xl shrink-0",
                                    isUnread ? info.iconBoxClass : "bg-muted text-muted-foreground"
                                  )}
                                >
                                  {isUnread ? <ItemIcon size={16} aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                                    <div className="flex items-center gap-1.5">
                                      <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide", info.badgeClass)}>
                                        {info.categoryLabel}
                                      </span>
                                      {isUnread && (
                                        <span className="rounded-full bg-[#8B1A3B] text-[#FFF9EC] px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-wide">
                                          Nouveau
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-muted-foreground">
                                      {humanWhen(m.createdAt)}
                                    </span>
                                  </div>
                                  <p className={cn("text-xs leading-relaxed", isUnread ? "font-semibold text-foreground" : "text-foreground/80")}>
                                    {m.message}
                                  </p>
                                  <div className="mt-2 flex items-center justify-between gap-2">
                                    <span className="text-[10px] text-muted-foreground">{info.channelDisplay}</span>
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-primary">
                                      {info.actionLabel} <ArrowRight size={12} />
                                    </span>
                                  </div>
                                </div>
                              </button>
                            </motion.li>
                          );
                        })}
                      </AnimatePresence>
                    </ul>
                  </section>
                )}
              </>
            )}
          </div>

          {/* ── Rappels sur mon téléphone (Web Push) ── */}
          <div className="shrink-0 border-t border-border px-4 pt-3 pb-4">
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
              <span
                className={cn(
                  "grid place-items-center h-10 w-10 rounded-full shrink-0",
                  pushStatus === "on" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                )}
                aria-hidden="true"
              >
                {pushBusy ? <Loader2 size={18} className="animate-spin" /> : <Smartphone size={18} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold">Alertes système sur ce téléphone</p>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {pushStatus === "unsupported"
                    ? "Non disponible sur ce navigateur"
                    : pushStatus === "on"
                      ? "Activées — tu es prévenue même écran éteint"
                      : "Reçois tes alertes bilan & RDV même app fermée"}
                </p>
              </div>
              <Switch
                checked={pushStatus === "on"}
                onCheckedChange={(v) => (v ? void enablePush() : void disablePush())}
                disabled={pushBusy || pushStatus === "checking" || pushStatus === "unsupported"}
                aria-label="Alertes système sur ce téléphone"
                className="h-9 w-13 [&_[data-slot=switch-thumb]]:size-6"
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
