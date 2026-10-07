"use client";
// Kènè — Console Admin · Gestion centralisée des rendez-vous et réservations du réseau
// 1. Liste chronologique de toutes les réservations prises dans tous les salons
// 2. Traçabilité des acomptes perçus en ligne via SasPay et des soldes restants
// 3. Changement d'état (confirmé, honoré, annulé, lapin)
// 4. Pass RDV PDF et relais WhatsApp direct

import { useEffect, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  Loader2,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  User,
  UserX,
  XCircle,
  Building2,
} from "lucide-react";
import { CauriIcon } from "@/components/kene/icons";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiGet, apiPatch } from "@/lib/kene/api";
import { xof, formatDate, formatTime } from "@/lib/kene/format";
import { openWhatsApp } from "@/lib/kene/whatsapp-relay";
import { KpiCard } from "@/components/kene/pro/ui-bits";

interface AdminAppointment {
  id: string;
  startAt: string;
  durationMin: number;
  status: "pending" | "confirmed" | "completed" | "cancelled" | "no_show";
  price: number;
  depositAmount: number;
  clientName: string;
  clientPhone: string;
  notes?: string | null;
  createdAt: string;
  tenant: {
    id: string;
    name: string;
    city: string;
    address?: string | null;
    phone?: string | null;
  };
  service: {
    id: string;
    name: string;
    durationMin: number;
    price: number;
  };
  resource?: {
    id: string;
    name: string;
  } | null;
  user?: {
    id: string;
    name: string;
    phone: string;
    email?: string | null;
  } | null;
}

interface AppointmentsResponse {
  appointments: AdminAppointment[];
  stats: {
    total: number;
    confirmed: number;
    completed: number;
    cancelled: number;
    pending: number;
    noShow: number;
    totalDepositAmount: number;
    totalVolume: number;
  };
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  confirmed: { label: "Confirmé (Acompte payé)", color: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30", icon: CheckCircle2 },
  completed: { label: "Soin Honoré", color: "bg-blue-500/15 text-blue-600 border-blue-500/30", icon: CheckCircle2 },
  pending: { label: "En attente", color: "bg-amber-500/15 text-amber-600 border-amber-500/30", icon: Clock },
  cancelled: { label: "Annulé", color: "bg-rose-500/15 text-rose-600 border-rose-500/30", icon: XCircle },
  no_show: { label: "Non présenté", color: "bg-zinc-500/15 text-zinc-600 border-zinc-500/30", icon: UserX },
};

export function AdminAppointments() {
  const [data, setData] = useState<AppointmentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchAppointments = async () => {
    setLoading(true);
    try {
      const q = encodeURIComponent(search.trim());
      const res = await apiGet<AppointmentsResponse>(
        `/api/admin/appointments?q=${q}&status=${encodeURIComponent(statusFilter)}`
      );
      setData(res);
    } catch (err: any) {
      toast.error("Erreur de chargement des rendez-vous", {
        description: err?.message || "Vérifie tes accès administrateur.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(fetchAppointments, 300);
    return () => clearTimeout(t);
  }, [search, statusFilter]);

  const handleStatusChange = async (appointmentId: string, newStatus: string) => {
    setUpdatingId(appointmentId);
    try {
      await apiPatch<{ success: boolean; appointment: AdminAppointment }>("/api/admin/appointments", {
        appointmentId,
        status: newStatus,
      });
      toast.success("Statut du rendez-vous mis à jour");
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          appointments: prev.appointments.map((a) => (a.id === appointmentId ? { ...a, status: newStatus as any } : a)),
        };
      });
    } catch (err: any) {
      toast.error("Échec de mise à jour du statut", { description: err?.message });
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-xl font-bold flex items-center gap-2">
            <Calendar className="size-5 text-primary" />
            Rendez-Vous &amp; Réservations du Réseau
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Supervision de l&apos;agenda multi-instituts et traçabilité des acomptes SasPay · Soins dispensés par les établissements partenaires
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchAppointments}
          disabled={loading}
          className="gap-1.5 rounded-full text-xs font-semibold self-start sm:self-auto"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
      </div>

      {/* Cartes KPIs de synthèse */}
      {data?.stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            icon={<Calendar className="size-4" />}
            label="Total Réservations"
            value={String(data.stats.total)}
            monetary={false}
          />
          <KpiCard
            icon={<CauriIcon className="size-4" />}
            label="Acomptes Encaissés (SasPay)"
            value={xof(data.stats.totalDepositAmount, { compact: true })}
            monetary={false}
            hint="Perçu en ligne par Kènè"
          />
          <KpiCard
            icon={<CheckCircle2 className="size-4" />}
            label="Confirmés / À Venir"
            value={String(data.stats.confirmed)}
            monetary={false}
            hint="Acompte certifié"
          />
          <KpiCard
            icon={<Clock className="size-4" />}
            label="Soins Honorés"
            value={String(data.stats.completed)}
            monetary={false}
          />
        </div>
      )}

      {/* Filtres & Recherche */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Rechercher par cliente, téléphone, institut ou soin..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 rounded-xl h-10 text-sm"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-56 rounded-xl h-10 text-sm">
            <Filter className="size-3.5 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Filtrer par statut" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="confirmed">Confirmés (Acompte payé)</SelectItem>
            <SelectItem value="completed">Honorés</SelectItem>
            <SelectItem value="pending">En attente d&apos;acompte</SelectItem>
            <SelectItem value="cancelled">Annulés</SelectItem>
            <SelectItem value="no_show">Non présentés (lapin)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Liste des Rendez-Vous */}
      <div className="space-y-3">
        {loading && !data ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm">Chargement des rendez-vous...</p>
          </div>
        ) : !data || data.appointments.length === 0 ? (
          <div className="p-8 rounded-2xl border border-dashed border-border text-center space-y-2 bg-card/50">
            <Calendar className="size-10 text-muted-foreground/60 mx-auto" />
            <p className="font-heading font-semibold text-sm">Aucun rendez-vous trouvé</p>
            <p className="text-xs text-muted-foreground">
              {search || statusFilter !== "all"
                ? "Essaie de modifier tes critères de filtre ou de recherche."
                : "Les réservations prises par les clientes apparaîtront ici en temps réel."}
            </p>
          </div>
        ) : (
          data.appointments.map((a) => {
            const statusConfig = STATUS_CONFIG[a.status] || STATUS_CONFIG.pending;
            const StatusIcon = statusConfig.icon;
            const remainingToPay = Math.max(0, a.price - a.depositAmount);

            return (
              <Card key={a.id} className="border-border/80 hover:border-border transition-all overflow-hidden">
                <CardContent className="p-4 sm:p-5 space-y-4">
                  {/* Ligne 1 : Date, Heure & Statut */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-border/60">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-heading font-bold text-sm text-foreground flex items-center gap-1.5">
                        <Clock className="size-3.5 text-primary" />
                        📅 {formatDate(a.startAt)} à {formatTime(a.startAt)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({a.durationMin} min)
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className={`gap-1 px-2.5 py-0.5 text-xs font-semibold border ${statusConfig.color}`}>
                        <StatusIcon className="size-3" />
                        {statusConfig.label}
                      </Badge>

                      {/* Sélecteur de statut rapide pour l'administrateur */}
                      <Select
                        value={a.status}
                        onValueChange={(val) => handleStatusChange(a.id, val)}
                        disabled={updatingId === a.id}
                      >
                        <SelectTrigger className="h-7 w-32 rounded-lg text-xs font-medium border-border/80">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          <SelectItem value="confirmed">Confirmé</SelectItem>
                          <SelectItem value="completed">Honoré</SelectItem>
                          <SelectItem value="cancelled">Annulé</SelectItem>
                          <SelectItem value="no_show">Lapin</SelectItem>
                          <SelectItem value="pending">En attente</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Ligne 2 : Grille Institut, Cliente, Prestation */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    {/* Colonne 1 : Institut partenaire */}
                    <div className="space-y-1.5 p-3 rounded-xl bg-muted/40 border border-border/50">
                      <p className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground flex items-center gap-1.5">
                        <Building2 className="size-3 text-primary" />
                        Institut d&apos;Accueil
                      </p>
                      <p className="font-heading font-bold text-sm text-foreground">{a.tenant.name}</p>
                      <p className="text-muted-foreground flex items-center gap-1">
                        <MapPin className="size-3" />
                        {a.tenant.city} {a.tenant.address ? `· ${a.tenant.address}` : ""}
                      </p>
                      {a.tenant.phone && (
                        <p className="text-muted-foreground text-[11px] flex items-center gap-1">
                          <Phone className="size-3" />
                          {a.tenant.phone}
                        </p>
                      )}
                    </div>

                    {/* Colonne 2 : Cliente */}
                    <div className="space-y-1.5 p-3 rounded-xl bg-muted/40 border border-border/50">
                      <p className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground flex items-center gap-1.5">
                        <User className="size-3 text-primary" />
                        Cliente
                      </p>
                      <p className="font-heading font-bold text-sm text-foreground">{a.clientName}</p>
                      <p className="text-muted-foreground flex items-center gap-1">
                        <Phone className="size-3" />
                        {a.clientPhone}
                      </p>
                      {a.user?.email && (
                        <p className="text-muted-foreground text-[11px] truncate">{a.user.email}</p>
                      )}
                    </div>

                    {/* Colonne 3 : Prestation & Acompte SasPay */}
                    <div className="space-y-1.5 p-3 rounded-xl bg-muted/40 border border-border/50">
                      <p className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground flex items-center gap-1.5">
                        <CauriIcon className="size-3 text-primary" />
                        Soin &amp; Acompte
                      </p>
                      <p className="font-semibold text-foreground truncate">{a.service.name}</p>
                      <div className="flex justify-between items-baseline">
                        <span className="text-muted-foreground">Prix du soin :</span>
                        <span className="font-heading font-bold text-foreground">{xof(a.price)}</span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-emerald-600 font-semibold">Acompte payé en ligne :</span>
                        <span className="font-bold text-emerald-600">{xof(a.depositAmount)}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>Solde à régler au salon :</span>
                        <span className="font-medium text-foreground">{xof(remainingToPay)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Ligne 3 : Actions rapides */}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const appUrl = typeof window !== "undefined" ? window.location.origin : "https://kene-beaute.com";
                        const passUrl = `${appUrl}/api/appointments/pass?id=${encodeURIComponent(a.id)}`;
                        const msg = `Bonjour ${a.clientName} ! 🌿 C'est l'équipe Kènè. Votre rendez-vous pour *${a.service.name}* chez *${a.tenant.name}* est bien programmé pour le ${formatDate(a.startAt)} à ${formatTime(a.startAt)}.\n\nVotre Pass Rendez-Vous officiel : ${passUrl}`;
                        openWhatsApp(a.clientPhone, msg);
                      }}
                      className="h-8 rounded-lg text-xs gap-1.5 text-[#128C7E] dark:text-[#25D366] border-[#25D366]/30 hover:bg-[#25D366]/10"
                    >
                      <MessageCircle className="size-3.5" />
                      WhatsApp Cliente
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      className="h-8 rounded-lg text-xs gap-1.5 border-border"
                    >
                      <a href={`/api/appointments/pass?id=${encodeURIComponent(a.id)}`} target="_blank" rel="noopener noreferrer">
                        <Download className="size-3.5" />
                        Pass Rendez-Vous (PDF)
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
