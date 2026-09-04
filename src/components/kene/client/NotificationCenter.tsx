"use client";
// Kènè Cliente — Centre de notifications : cloche (badge non-lus) + Sheet
// « À venir » (rappels programmés) / « Reçues » (envoyées, état lu/non lue)
// + « Tout marquer comme lu » (POST /api/notifications/read).
// TEMPS RÉEL (tâche 33) : socket.io vers le mini-service notify-service
// (?XTransformPort=3004) — le fil arrive en PUSH (event `feed`) : badge, liste
// et toast d'arrivée se mettent à jour SANS reload pendant que l'app est ouverte.
// Dégradation douce : sans service, le comportement historique (GET au montage
// + à l'ouverture) reste intact.
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { io, type Socket } from "socket.io-client";
import { armHeartbeat } from "@/lib/kene/live-socket";
import { Bell, BellRing, CheckCheck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiPost } from "@/lib/kene/api";
import { channelLabel, humanWhen } from "@/lib/kene/reminders";
import { cn } from "@/lib/utils";
import type { ApiReminderFeed } from "./types";

const NOTIFY_PORT = 3004;

function looksLikeFeed(f: unknown): f is ApiReminderFeed {
  const x = f as Partial<ApiReminderFeed> | null;
  return !!x && typeof x.unread === "number" && Array.isArray(x.sent) && Array.isArray(x.scheduled);
}

function excerpt(s: string, max = 70): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function NotificationCenter({
  userId,
  onLiveFeed,
}: {
  userId: string;
  /** Appelé à chaque fil reçu en temps réel (badge + liste à jour) */
  onLiveFeed?: (feed: ApiReminderFeed) => void;
}) {
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState<ApiReminderFeed | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [live, setLive] = useState(false);

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
        const f = await apiGet<ApiReminderFeed>(`/api/notifications?userId=${userId}`);
        setFeed(f);
        prevUnreadRef.current = f.unread;
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

  /* ── Temps réel : connexion au notify-service ──────────────────
   * io('/?XTransformPort=3004') : la gateway route vers le mini-service.
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

    // Auto-guérison : service redémarré à chaud → zombie détecté ≤ 35 s,
    // reconnexion → join rejoué au connect.
    const disarm = armHeartbeat(socket);

    socket.on("connect", () => {
      setLive(true);
      socket.emit("join", { userId });
    });
    socket.on("disconnect", () => setLive(false));
    socket.on("feed", (f: unknown) => {
      if (!looksLikeFeed(f)) return;
      setFeed(f);
      // Toast d'arrivée : seulement une NOUVELLE non-lue, feuille fermée
      // (feuille ouverte → la liste s'anime d'elle-même).
      const prev = prevUnreadRef.current;
      if (prev !== null && f.unread > prev && !openRef.current) {
        const first = f.sent.find((n) => !n.readAt);
        toast("Nouvelle notification", {
          description: first ? excerpt(first.message) : `${f.unread} notification${f.unread > 1 ? "s" : ""} non lue${f.unread > 1 ? "s" : ""}.`,
        });
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
  }, [userId]);

  // Refraîchi à chaque ouverture (doublon volontaire : le GET déclenche aussi
  // backfill + due-runner côté API — le socket prend ensuite le relais)
  function onOpenChange(o: boolean) {
    setOpen(o);
    openRef.current = o;
    if (o) void load(true);
  }

  async function markAllRead() {
    if (busy || unread === 0) return;
    setBusy(true);
    try {
      const r = await apiPost<{ ok: boolean; updated: number }>("/api/notifications/read", { userId });
      // Mise à jour locale immédiate : badge à zéro + items marqués lus
      setFeed((f) =>
        f
          ? { ...f, unread: 0, sent: f.sent.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) }
          : f
      );
      prevUnreadRef.current = 0;
      // Le service temps réel repousse un fil frais (jamais de badge périmé)
      socketRef.current?.emit("read-all", { userId });
      toast.success("Tout est lu", { description: `${r.updated} notification${r.updated > 1 ? "s" : ""} marquée${r.updated > 1 ? "s" : ""} comme lue${r.updated > 1 ? "s" : ""}.` });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible de marquer comme lu");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => onOpenChange(true)}
        aria-label={unread > 0 ? `Notifications — ${unread} non lue${unread > 1 ? "s" : ""}` : "Notifications"}
        className="relative h-11 w-11 grid place-items-center rounded-full bg-card border border-border text-foreground shadow-sm active:scale-95 transition-transform focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
      >
        <Bell size={20} strokeWidth={1.9} aria-hidden="true" />
        {unread > 0 && (
          <span
            role="status"
            aria-live="polite"
            className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-[#8B1A3B] text-[#FFF9EC] text-[10px] font-black grid place-items-center ring-2 ring-background"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="max-w-[560px] mx-auto rounded-t-3xl max-h-[82vh] flex flex-col"
        >
          <SheetHeader className="text-left shrink-0">
            <SheetTitle className="font-heading font-black flex items-center gap-2 flex-wrap">
              <BellRing size={18} className="text-primary" aria-hidden="true" /> Notifications
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
            <p className="text-xs text-muted-foreground">
              Rappels automatiques Kènè — contrôle de protocole, RDV J-1 et messages de l&apos;institut.
            </p>
            {unread > 0 && (
              <Button
                variant="outline"
                onClick={markAllRead}
                disabled={busy}
                className="gap-1.5 w-fit min-h-11 px-4 text-xs"
              >
                <CheckCheck size={14} aria-hidden="true" />
                {busy ? "Marquage…" : `Tout marquer comme lu (${unread})`}
              </Button>
            )}
          </SheetHeader>

          <div className="flex-1 overflow-y-auto pretty-scroll px-4 pb-5 space-y-4">
            {loading && !feed ? (
              <div className="space-y-2.5 pt-2">
                <Skeleton className="h-[76px] rounded-2xl" />
                <Skeleton className="h-[76px] rounded-2xl" />
                <Skeleton className="h-[76px] rounded-2xl" />
              </div>
            ) : err && !feed ? (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-center">
                <p className="text-xs text-destructive">{err}</p>
                <Button variant="outline" className="mt-2 min-h-11 px-4" onClick={() => void load(true)}>
                  Réessayer
                </Button>
              </div>
            ) : !feed || (feed.scheduled.length === 0 && feed.sent.length === 0) ? (
              <div className="rounded-2xl border border-dashed border-border bg-card/60 p-5 text-center">
                <BellRing size={22} className="mx-auto text-primary" aria-hidden="true" />
                <p className="mt-2 text-xs font-semibold">Aucune notification pour l&apos;instant</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Tes rappels s&apos;activent tout seuls : contrôle 3 semaines après un scan, rappel J-1 avant chaque RDV.
                </p>
              </div>
            ) : (
              <>
                {/* ── À venir ── */}
                {feed.scheduled.length > 0 && (
                  <section aria-labelledby="nc-upcoming" className="pt-1">
                    <p id="nc-upcoming" className="text-[10px] uppercase tracking-[0.14em] font-bold text-[#3F7D3F] mb-2">
                      À venir ({feed.scheduled.length})
                    </p>
                    <ul className="space-y-2.5">
                      {feed.scheduled.map((m) => (
                        <li
                          key={m.id}
                          className="flex items-start gap-3 rounded-2xl border border-[#3F7D3F]/25 bg-[#3F7D3F]/5 p-3.5"
                        >
                          <span className="grid place-items-center h-9 w-9 rounded-full bg-[#3F7D3F]/15 text-[#3F7D3F] shrink-0">
                            <BellRing size={16} aria-hidden="true" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs leading-relaxed">{m.message}</p>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <span className="rounded-full bg-[#3F7D3F]/15 text-[#3F7D3F] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                                Programmé
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {m.scheduledAt ? humanWhen(m.scheduledAt) : "à venir"} · {channelLabel(m.channel)}
                              </span>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* ── Reçues ── */}
                {feed.sent.length > 0 && (
                  <section aria-labelledby="nc-sent">
                    <p id="nc-sent" className="text-[10px] uppercase tracking-[0.14em] font-bold text-muted-foreground mb-2">
                      Reçues ({feed.sent.length})
                    </p>
                    <ul className="space-y-2.5">
                      <AnimatePresence initial={false}>
                        {feed.sent.map((m) => {
                          const isUnread = !m.readAt;
                          return (
                            <motion.li
                              key={m.id}
                              layout
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -6 }}
                              className={cn(
                                "flex items-start gap-3 rounded-2xl border p-3.5 transition-colors",
                                isUnread ? "border-primary/30 bg-primary/[0.06]" : "border-border bg-card"
                              )}
                            >
                              <span
                                className={cn(
                                  "grid place-items-center h-9 w-9 rounded-full shrink-0",
                                  isUnread ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                                )}
                              >
                                {isUnread ? <BellRing size={16} aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className={cn("text-xs leading-relaxed", isUnread ? "font-medium" : "text-foreground/80")}>{m.message}</p>
                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                  {isUnread && (
                                    <span className="rounded-full bg-[#8B1A3B]/12 text-[#8B1A3B] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                                      Nouveau
                                    </span>
                                  )}
                                  <span className="text-[10px] text-muted-foreground">
                                    {humanWhen(m.createdAt)} · {channelLabel(m.channel)}
                                  </span>
                                </div>
                              </div>
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
        </SheetContent>
      </Sheet>
    </>
  );
}
