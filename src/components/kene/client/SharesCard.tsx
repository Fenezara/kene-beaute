"use client";
// Kènè Cliente — « Partage avec mes instituts »: la cliente décide, institut
// par institut, qui voit l'historique de ses self-scans (photos, scores,
// évolution). Accordé à la réservation ou ici, révocable à tout moment —
// chaque décision est horodatée (traçabilité RGPD). Le miroir peau
// (type + phototype) reste partagé: c'est le contexte minimal du soin.
import { useCallback, useEffect, useState } from "react";
import { Building2, Check, Loader2, Lock, Share2 } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/kene/api";
import { formatDate } from "@/lib/kene/format";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionTitle } from "./bits";

export interface InstituteShare {
  tenantId: string;
  name: string;
  city: string;
  active: boolean;
  hasPhoto: boolean;
  granted: boolean;
  visitsCount: number;
  lastVisit: string | null;
}

type SharesData = { scansTotal: number; shares: InstituteShare[] };

export function SharesCard({ userId, userName }: { userId: string; userName: string }) {
  const [data, setData] = useState<SharesData | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    apiGet<SharesData>(`/api/auth/shares?userId=${userId}`)
      .then((r) => {
        setData(r);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(share: InstituteShare, next: boolean) {
    setBusyId(share.tenantId);
    try {
      await apiPost("/api/auth/shares", { userId, tenantId: share.tenantId, granted: next });
      setData((d) =>
        d ? { ...d, shares: d.shares.map((s) => (s.tenantId === share.tenantId ? { ...s, granted: next } : s)) } : d,
      );
      toast.success(
        next
          ? `Diagnostics partagés avec ${share.name}`
          : `Partage retiré pour ${share.name}`,
        {
          description: next
            ? "Ton esthéticienne voit ton historique de scans pour personnaliser tes soins."
            : "L'institut ne voit plus tes self-scans — effectif immédiatement.",
        },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mise à jour impossible");
    } finally {
      setBusyId(null);
    }
  }

  const firstName = userName.trim().split(/\s+/)[0] ?? userName;

  return (
    <section aria-labelledby="sh-t">
      <SectionTitle icon={<Share2 size={16} />}>
        <span id="sh-t">Partage avec mes instituts</span>
      </SectionTitle>
      <div className="k-card rounded-[24px] p-4">
        <p className="text-[13px] font-semibold leading-snug">
          Tes scans, ta décision — institut par institut
        </p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
          Un institut ne voit l&apos;historique de tes self-scans ({data?.scansTotal ?? "…"} au total) que si tu
          l&apos;acceptes. Il voit toujours ton profil de base (type de peau, phototype) pour préparer tes soins —
          <strong className="font-semibold text-foreground/80"> jamais tes photos sans ton accord</strong>.
        </p>

        <div className="mt-3.5 space-y-2">
          {!data && !failed && (
            <>
              <Skeleton className="h-16 rounded-2xl" />
              <Skeleton className="h-16 rounded-2xl" />
            </>
          )}
          {failed && (
            <p className="rounded-2xl bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
              Liste indisponible pour le moment — tire pour rafraîchir la page.
            </p>
          )}
          {data && data.shares.length === 0 && (
            <p className="rounded-2xl bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
              Tu n&apos;as pas encore de fiche chez un institut. Réserve un soin ou commande un produit : l&apos;institut
              apparaîtra ici, et tu choisiras ce que tu partages.
            </p>
          )}
          {data?.shares.map((s) => (
            <div
              key={s.tenantId}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card/60 p-3"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold-text">
                <Building2 size={18} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{s.name}</p>
                <p className="text-[10.5px] leading-snug text-muted-foreground">
                  {s.city}
                  {s.lastVisit ? ` · dernière visite ${formatDate(s.lastVisit, { day: "numeric", month: "short" })}` : ""}
                  {" · "}
                  {s.granted ? (
                    <span className="inline-flex items-center gap-0.5 font-semibold text-[#2E5C2E] dark:text-[#8FD18F]">
                      <Check size={10} aria-hidden="true" /> historique partagé
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 font-semibold">
                      <Lock size={10} aria-hidden="true" /> historique privé
                    </span>
                  )}
                </p>
              </div>
              <Switch
                checked={s.granted}
                disabled={busyId === s.tenantId}
                onCheckedChange={(v) => toggle(s, v)}
                aria-label={
                  s.granted
                    ? `Retirer le partage de mes diagnostics avec ${s.name}`
                    : `Partager mes diagnostics avec ${s.name}`
                }
              />
              {busyId === s.tenantId && <Loader2 size={14} className="animate-spin text-muted-foreground" aria-hidden="true" />}
            </div>
          ))}
        </div>

        <p className="mt-3 border-t border-dashed border-border pt-2.5 text-[10px] leading-relaxed text-muted-foreground">
          {firstName}, chaque accord et chaque retrait sont horodatés et conservés (RGPD / loi ivoirienne
          n°2013-450). Retirer un partage est effectif immédiatement — l&apos;institut garde ses propres diagnostics
          cabine, mais ne voit plus tes self-scans.
        </p>
      </div>
    </section>
  );
}
