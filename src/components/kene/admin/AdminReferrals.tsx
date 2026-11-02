"use client";
// Kènè — Console Admin : Pilotage du Fil du Parrainage & des Ambassadrices
// Supervision en direct de la viralité, classement des marraines et attribution de mois bonus.
import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Gift,
  HeartHandshake,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Trophy,
  UserCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/kene/api";
import { formatDate } from "@/lib/kene/format";
import { useApi } from "@/components/kene/pro/useApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface InviteeRow {
  id: string;
  name: string;
  phone: string;
  joinedAt: string;
  hasScanned: boolean;
}

interface AmbassadorRow {
  id: string;
  name: string;
  phone: string;
  role: string;
  city: string | null;
  referralCode: string;
  totalInvitees: number;
  scannedCount: number;
  monthsGranted: number;
  tierName: string;
  currentTierId: string | null;
  nextTierGoal: number;
  progressPct: number;
  activeSubUntil: string | null;
  invitees: InviteeRow[];
}

interface AdminReferralsData {
  stats: {
    totalReferrals: number;
    totalActiveScanned: number;
    totalAmbassadors: number;
    totalMonthsGiven: number;
    tierBreakdown: {
      initie: number;
      ambassadrice: number;
      cercle_dor: number;
      icone: number;
      en_route: number;
    };
  };
  tiers: Array<{
    id: string;
    name: string;
    minInvitees: number;
    monthsGranted: number;
    perks: string;
  }>;
  ambassadors: AmbassadorRow[];
}

export function AdminReferrals() {
  const [q, setQ] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Dialogue d'attribution de mois
  const [grantTarget, setGrantTarget] = useState<AmbassadorRow | null>(null);
  const [grantMonths, setGrantMonths] = useState(1);
  const [grantReason, setGrantReason] = useState("Bonus fidélité ambassadrice");
  const [busyGrant, setBusyGrant] = useState(false);

  const { data, loading, error, refetch } = useApi(
    () => apiGet<AdminReferralsData>(`/api/admin/referrals?q=${encodeURIComponent(q)}`),
    [q]
  );

  async function handleGrant() {
    if (!grantTarget) return;
    setBusyGrant(true);
    try {
      await apiPost("/api/admin/referrals/grant", {
        userId: grantTarget.id,
        months: grantMonths,
        reason: grantReason,
      });
      toast.success(`+${grantMonths} mois Kènè+ offerts à ${grantTarget.name} 💛`);
      setGrantTarget(null);
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur d'attribution");
    } finally {
      setBusyGrant(false);
    }
  }

  function getTierBadgeClass(tierName: string) {
    switch (tierName) {
      case "Icône Beauté":
        return "bg-amber-500/20 text-amber-500 border-amber-500/40";
      case "Cercle d'Or":
        return "bg-yellow-500/20 text-yellow-600 border-yellow-500/40";
      case "Ambassadrice":
        return "bg-emerald-500/20 text-emerald-600 border-emerald-500/40";
      case "Initié":
        return "bg-blue-500/20 text-blue-600 border-blue-500/40";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-heading font-black flex items-center gap-2">
            <HeartHandshake className="size-6 text-[#C8951E]" />
            Le Fil du Parrainage & Ambassadrices
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Supervisez la viralité Kènè 2026 : seuil de départ 10 amies = 1 mois offert, zéro cash.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refetch}
          disabled={loading}
          className="gap-2 h-9 self-start sm:self-auto"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
      </div>

      {/* Cartes KPIs */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="p-4 bg-card/60">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wide">
              <Users className="size-4 text-primary" /> Filleules Réunies
            </p>
            <p className="text-2xl font-heading font-black mt-1 text-foreground">{data.stats.totalReferrals}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Nouvelles clientes rattachées</p>
          </Card>

          <Card className="p-4 bg-card/60">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wide">
              <UserCheck className="size-4 text-emerald-600" /> Diagnostiquées
            </p>
            <p className="text-2xl font-heading font-black mt-1 text-emerald-600">{data.stats.totalActiveScanned}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {data.stats.totalReferrals > 0
                ? `${Math.round((data.stats.totalActiveScanned / data.stats.totalReferrals) * 100)}% ont scanné leur visage`
                : "En attente de scan"}
            </p>
          </Card>

          <Card className="p-4 bg-card/60">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wide">
              <Trophy className="size-4 text-[#C8951E]" /> Ambassadrices Actives
            </p>
            <p className="text-2xl font-heading font-black mt-1 text-[#C8951E]">{data.stats.totalAmbassadors}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Marraines prescriptrices</p>
          </Card>

          <Card className="p-4 bg-card/60">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wide">
              <Gift className="size-4 text-purple-500" /> Mois Kènè+ Offerts
            </p>
            <p className="text-2xl font-heading font-black mt-1 text-purple-600">{data.stats.totalMonthsGiven} mois</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Coût cash Kènè = 0 FCFA</p>
          </Card>
        </div>
      )}

      {/* Barre des Paliers Kènè 2026 */}
      {data && (
        <Card className="p-4 sm:p-5 border-border/70">
          <CardTitle className="text-sm font-bold flex items-center gap-2 mb-3">
            <Sparkles className="size-4 text-[#C8951E]" /> Paliers d&apos;Éligibilité Kènè 2026 (Base 10 Amies)
          </CardTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl border border-blue-500/30 bg-blue-500/5">
              <div className="flex items-center justify-between font-bold text-blue-600">
                <span>Initié</span>
                <span>10 amies</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">1 mois Kènè+ offert</p>
              <p className="text-[10px] font-mono font-bold mt-2 text-foreground/80">
                {data.stats.tierBreakdown.initie} ambassadrice(s)
              </p>
            </div>

            <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
              <div className="flex items-center justify-between font-bold text-emerald-600">
                <span>Ambassadrice</span>
                <span>25 amies</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">3 mois + Time-Lapse HD</p>
              <p className="text-[10px] font-mono font-bold mt-2 text-foreground/80">
                {data.stats.tierBreakdown.ambassadrice} ambassadrice(s)
              </p>
            </div>

            <div className="p-3 rounded-xl border border-yellow-500/30 bg-yellow-500/5">
              <div className="flex items-center justify-between font-bold text-yellow-600">
                <span>Cercle d&apos;Or</span>
                <span>50 amies</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">6 mois + Accès Bêta IA</p>
              <p className="text-[10px] font-mono font-bold mt-2 text-foreground/80">
                {data.stats.tierBreakdown.cercle_dor} ambassadrice(s)
              </p>
            </div>

            <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5">
              <div className="flex items-center justify-between font-bold text-amber-600">
                <span>Icône Beauté</span>
                <span>100 amies</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">1 An Kènè+ + Statut à vie</p>
              <p className="text-[10px] font-mono font-bold mt-2 text-foreground/80">
                {data.stats.tierBreakdown.icone} ambassadrice(s)
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Classement des Ambassadrices (Leaderboard) */}
      <Card className="border-border/80">
        <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-bold">Classement des Ambassadrices</CardTitle>
            <CardDescription className="text-xs">
              Marraines classées par volume de filleules rattachées et état de leurs diagnostics.
            </CardDescription>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher nom, tél, code..."
              className="h-9 pl-8 text-xs"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading && !data && (
            <div className="py-12 flex items-center justify-center text-muted-foreground text-xs gap-2">
              <Loader2 className="size-4 animate-spin" /> Chargement du réseau de parrainage...
            </div>
          )}

          {error && (
            <div className="p-6 text-center text-xs text-destructive">
              Erreur lors du chargement : {error}
            </div>
          )}

          {data && data.ambassadors.length === 0 && (
            <div className="py-12 text-center text-xs text-muted-foreground">
              Aucun parrainage correspondant aux critères de recherche.
            </div>
          )}

          {data && data.ambassadors.length > 0 && (
            <div className="divide-y divide-border">
              {data.ambassadors.map((a, idx) => {
                const isExpanded = expandedId === a.id;
                return (
                  <div key={a.id} className="transition-colors hover:bg-muted/20">
                    <div className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      {/* Identité Marraine */}
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="grid place-items-center size-8 rounded-full bg-primary/10 text-primary font-black text-xs shrink-0 mt-0.5">
                          #{idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-sm text-foreground truncate">{a.name}</p>
                            <span className="font-mono text-[11px] text-muted-foreground">{a.phone}</span>
                            <Badge variant="outline" className={`text-[10px] font-bold ${getTierBadgeClass(a.tierName)}`}>
                              {a.tierName}
                            </Badge>
                            {a.role === "pro" && (
                              <Badge variant="secondary" className="text-[9px]">Institut Pro</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                            <span>Code : <strong className="font-mono text-foreground">{a.referralCode}</strong></span>
                            {a.city && <span>Ville : {a.city}</span>}
                            {a.activeSubUntil && (
                              <span className="text-purple-600 font-medium">
                                Kènè+ jusqu&apos;au {formatDate(a.activeSubUntil, { day: "numeric", month: "short", year: "numeric" })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Métriques & Actions */}
                      <div className="flex items-center justify-between lg:justify-end gap-3 shrink-0">
                        <div className="text-right">
                          <p className="text-xs font-mono font-bold text-foreground">
                            {a.totalInvitees} amie{a.totalInvitees > 1 ? "s" : ""}
                            <span className="text-emerald-600 font-normal ml-1">({a.scannedCount} scan{a.scannedCount > 1 ? "s" : ""})</span>
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {a.monthsGranted} mois offert{a.monthsGranted > 1 ? "s" : ""}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setGrantTarget(a);
                              setGrantMonths(1);
                              setGrantReason("Bonus ambassadrice");
                            }}
                            className="h-8 text-xs gap-1"
                          >
                            <Gift className="size-3.5 text-purple-500" /> Offrir
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedId(isExpanded ? null : a.id)}
                            className="h-8 px-2 text-xs"
                          >
                            {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Filleules rattachées déroulables */}
                    {isExpanded && (
                      <div className="bg-muted/40 px-4 py-3 border-t border-border/60">
                        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-2">
                          Filleules rattachées ({a.invitees.length})
                        </p>
                        {a.invitees.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Aucune filleule pour le moment.</p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                            {a.invitees.map((f) => (
                              <div
                                key={f.id}
                                className="p-2.5 rounded-lg border border-border/70 bg-card text-xs flex items-center justify-between gap-2"
                              >
                                <div className="min-w-0">
                                  <p className="font-semibold truncate">{f.name}</p>
                                  <p className="text-[10px] text-muted-foreground">
                                    Rejointe le {formatDate(f.joinedAt, { day: "numeric", month: "short" })}
                                  </p>
                                </div>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                                    f.hasScanned
                                      ? "bg-emerald-500/15 text-emerald-600"
                                      : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  {f.hasScanned ? "Scan validé ✓" : "Sans scan"}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogue d'Attribution Manuelle de Mois Kènè+ */}
      <Dialog open={Boolean(grantTarget)} onOpenChange={(o) => { if (!o) setGrantTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="size-5 text-purple-500" />
              Offrir des mois Kènè+
            </DialogTitle>
            <DialogDescription>
              Attribuez manuellement des mois d&apos;abonnement à {grantTarget?.name} pour récompenser son rôle d&apos;ambassadrice.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="months-input" className="text-xs font-bold uppercase tracking-wide">
                Nombre de mois à créditer
              </Label>
              <div className="flex items-center gap-2 mt-1.5">
                {[1, 3, 6, 12].map((m) => (
                  <Button
                    key={m}
                    type="button"
                    variant={grantMonths === m ? "default" : "outline"}
                    size="sm"
                    onClick={() => setGrantMonths(m)}
                    className="flex-1 text-xs"
                  >
                    +{m} mois
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="grant-reason" className="text-xs font-bold uppercase tracking-wide">
                Motif (tracé dans le journal d&apos;audit)
              </Label>
              <Input
                id="grant-reason"
                value={grantReason}
                onChange={(e) => setGrantReason(e.target.value)}
                placeholder="Ex. Ambassadrice événement Abidjan"
                className="mt-1.5 text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setGrantTarget(null)} disabled={busyGrant}>
              Annuler
            </Button>
            <Button size="sm" onClick={handleGrant} disabled={busyGrant} className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
              {busyGrant ? <Loader2 className="size-4 animate-spin" /> : <Gift className="size-4" />}
              Confirmer +{grantMonths} mois
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
