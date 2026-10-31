"use client";
// Kènè Pro — CRM: recherche, segments RFM, fiche cliente (ventes, RDV,
// commandes, avis, bilans dermo-cosmétiques, diagnostics en institut, notes)
// — WhatsApp direct depuis la fiche cliente: message de prise de
// contact pré-rempli (wa.me), même mécanique que les relances du Fil du Retour.
import { useEffect, useMemo, useState } from "react";
import { Crown, FileDown, MessageCircle, Phone, Search, Users, Wallet, Save, Star, Pencil, Plus, ShoppingBag, PackageCheck, Trash2, AlertTriangle, Loader2, UserPlus, Baby, Calendar, Gift, MapPin, FolderHeart, ChevronRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { apiGet, apiPatch, apiPost, apiDelete, ApiError } from "@/lib/kene/api";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { xof, formatDate, formatTime } from "@/lib/kene/format";
import { rfmScore, RFM_SEGMENT_STYLES } from "@/lib/kene/rfm";
import { RFM_SEGMENTS } from "@/lib/kene/types";
import { waLink } from "@/lib/kene/followups";
import { openWhatsApp } from "@/lib/kene/whatsapp-relay";
import { useApi } from "./useApi";
import { ApptStatusBadge, EmptyState, ErrorState, InitialAvatar, Money, SectionHeader, KenteTop } from "./ui-bits";
import { OrderStatusBadge } from "./OrdersSection";
import { proToastError } from "./ProApp";
import { DEFAULT_FALLBACK_CLIENTS } from "@/lib/kene/fallback-catalog";
import { formatPhoneDisplay } from "@/lib/kene/phone-normalize";
import { matchesSearch } from "@/lib/kene/search";
import type { ProClient, ProClientDetail } from "./types";

function useDebounced<T>(value: T, delay = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return v;
}

function segmentBadge(segment: string) {
  const st = RFM_SEGMENT_STYLES[segment] ?? { bg: "bg-muted", text: "text-muted-foreground", label: segment };
  return <Badge variant="outline" className={cn("text-[10px] px-1.5", st.bg, st.text)}>{st.label}</Badge>;
}

function RfmDots({ client }: { client: ProClient }) {
  const recencyDays = client.lastVisit ? Math.floor((Date.now() - new Date(client.lastVisit).getTime()) / 86_400_000) : 999;
  const score = useMemo(() => rfmScore(recencyDays, client.visitsCount, client.totalSpent), [recencyDays, client.visitsCount, client.totalSpent]);
  const groups: { key: keyof typeof score; label: string; hint: string }[] = [
    { key: "r", label: "Récence", hint: `${recencyDays > 900 ? "jamais" : `${recencyDays} j`} depuis la dernière visite` },
    { key: "f", label: "Fréquence", hint: `${client.visitsCount} visite(s)` },
    { key: "m", label: "Montant", hint: xof(client.totalSpent) },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {groups.map((g) => {
        const val = score[g.key] as number;
        return (
          <div key={g.key} className="rounded-xl border border-border bg-muted/40 p-2.5 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{g.label}</p>
            <div className="mt-1.5 flex justify-center gap-1" role="img" aria-label={`${g.label} : ${val}/5`}>
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className={cn("size-2.5 rounded-full", i < val ? "bg-gold" : "bg-border")} aria-hidden="true" />
              ))}
            </div>
            <p className="mt-1 font-mono text-sm font-semibold text-gold-text">{val}/5</p>
            <p className="text-[9px] text-muted-foreground leading-tight">{g.hint}</p>
          </div>
        );
      })}
    </div>
  );
}

export function CrmSection({
  tenantId,
  onStartDiagnostic,
  createClientNonce,
  onOpenSkinDossier,
}: {
  tenantId: string;
  onStartDiagnostic?: (clientId: string) => void;
  createClientNonce?: number;
  onOpenSkinDossier?: (clientId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const q = useDebounced(query);
  const [segment, setSegment] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [birthdayMonthOnly, setBirthdayMonthOnly] = useState<boolean>(false);
  const [openId, setOpenId] = useState<string | null>(null);

  // Création d'une nouvelle cliente depuis le CRM
  const [createOpen, setCreateOpen] = useState(false);
  const [seenNonce, setSeenNonce] = useState(0);
  if (createClientNonce && createClientNonce > seenNonce) {
    setSeenNonce(createClientNonce);
    setCreateOpen(true);
  }
  const [createName, setCreateName] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createDistrict, setCreateDistrict] = useState("");
  const [createSkinType, setCreateSkinType] = useState<string>("mixte");
  const [createNotes, setCreateNotes] = useState("");
  const [createBusy, setCreateBusy] = useState(false);

  const clients = useApi<ProClient[]>(
    async () => {
      if (!tenantId) return DEFAULT_FALLBACK_CLIENTS;
      try {
        const res = await apiGet<{ clients: ProClient[] }>(`/api/pro/clients?tenantId=${tenantId}`);
        return res.clients ?? [];
      } catch (err) {
        return DEFAULT_FALLBACK_CLIENTS;
      }
    },
    [tenantId],
    { cacheKey: `kene_pro_clients_${tenantId || "default"}`, fallbackData: DEFAULT_FALLBACK_CLIENTS }
  );

  async function handleCreateClient(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const name = createName.trim().replace(/\s+/g, " ");
    const phone = createPhone.trim();
    if (name.length < 2) {
      toast.error("Le nom doit comporter au moins 2 caractères");
      return;
    }
    if (phone.replace(/\D/g, "").length < 8) {
      toast.error("Numéro de téléphone invalide (8 chiffres minimum)");
      return;
    }
    setCreateBusy(true);
    try {
      const res = await apiPost<{ client: ProClient; reused: boolean }>("/api/pro/clients", {
        tenantId,
        name,
        phone,
        email: createEmail.trim() || undefined,
        district: createDistrict.trim() || undefined,
        skinType: createSkinType || undefined,
        notes: createNotes.trim() || undefined,
      });
      setCreateOpen(false);
      setCreateName("");
      setCreatePhone("");
      setCreateEmail("");
      setCreateDistrict("");
      setCreateNotes("");
      await clients.refetch();
      setOpenId(res.client.id);
      toast.success(
        res.reused
          ? `Fiche cliente existante retrouvée : ${res.client.name}`
          : `Nouvelle cliente enregistrée : ${res.client.name}`
      );
    } catch (err) {
      proToastError(err, "Impossible d'enregistrer la cliente");
    } finally {
      setCreateBusy(false);
    }
  }

  const availableDistricts = useMemo(() => {
    const set = new Set<string>();
    (clients.data ?? []).forEach((c) => {
      if (c.district && c.district.trim()) set.add(c.district.trim());
    });
    return Array.from(set).sort();
  }, [clients.data]);

  const isBirthdayThisMonth = (birthDate?: string | null): boolean => {
    if (!birthDate) return false;
    const curMonth = new Date().getMonth() + 1;
    const clean = birthDate.trim();
    let m: number | null = null;
    if (clean.includes("/")) {
      m = parseInt(clean.split("/")[1], 10);
    } else if (clean.includes("-")) {
      const parts = clean.split("-");
      m = parts.length >= 3 ? parseInt(parts[1], 10) : parseInt(parts[0], 10);
    }
    return m === curMonth;
  };

  const filtered = useMemo(() => {
    return (clients.data ?? []).filter((c) => {
      if (query.trim() && !matchesSearch(query, c.name, c.phone, c.district, c.email, c.notes)) {
        return false;
      }
      if (segment && c.rfmSegment !== segment) return false;
      if (selectedDistrict && c.district !== selectedDistrict) return false;
      if (birthdayMonthOnly && !isBirthdayThisMonth(c.birthDate)) return false;
      return true;
    });
  }, [clients.data, query, segment, selectedDistrict, birthdayMonthOnly]);
  const all = clients.data ?? [];
  const totalClients = all.length;
  const totalSpent = all.reduce((s, c) => s + c.totalSpent, 0);
  const totalVisits = all.reduce((s, c) => s + c.visitsCount, 0);
  const avgBasket = totalVisits > 0 ? Math.round(totalSpent / totalVisits) : 0;
  const champions = all.filter((c) => c.rfmSegment === "Champions").length;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="CRM"
        sub="Base clientes, segmentation RFM et historique complet"
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher nom ou téléphone…" className="pl-8 w-48 sm:w-64 bg-card text-xs h-9" aria-label="Rechercher une cliente" />
            </div>
            <Button
              onClick={() => {
                setCreateName(query && !/^\+?\d+$/.test(query.replace(/\s/g, "")) ? query : "");
                setCreatePhone(query && /^\+?\d+$/.test(query.replace(/\s/g, "")) ? query : "");
                setCreateOpen(true);
              }}
              className="k-btn-gold text-primary-foreground font-semibold text-xs h-9 gap-1.5 shrink-0"
              aria-label="Enregistrer une nouvelle cliente"
            >
              <Plus className="size-4" aria-hidden="true" />
              <span>Nouvelle cliente</span>
            </Button>
          </div>
        }
      />

      {/* Stats rapides */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: <Users className="size-4" />, label: "Clientes", value: String(totalClients) },
          { icon: <Wallet className="size-4" />, label: "Panier moyen", value: xof(avgBasket) },
          { icon: <Crown className="size-4" />, label: "Champions RFM", value: String(champions) },
        ].map((s) => (
          <Card key={s.label} className="overflow-hidden pt-0">
            <KenteTop />
            <CardContent className="p-3 flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-gold/12 text-gold-text shrink-0">{s.icon}</span>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
                <p className="font-mono text-lg font-semibold leading-tight tabular-nums truncate">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filtres segments */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5" role="group" aria-label="Filtrer par segment RFM">
        <button
          onClick={() => setSegment(null)}
          className={cn("shrink-0 rounded-full px-3 py-1.5 min-h-11 text-xs font-medium transition-colors", !segment ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}
        >
          Tous ({totalClients})
        </button>
        {RFM_SEGMENTS.map((seg) => {
          const n = all.filter((c) => c.rfmSegment === seg).length;
          const st = RFM_SEGMENT_STYLES[seg];
          return (
            <button
              key={seg}
              onClick={() => setSegment(segment === seg ? null : seg)}
              aria-pressed={segment === seg}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 min-h-11 text-xs font-medium border transition-colors",
                segment === seg ? cn(st.bg, st.text, "border-current font-semibold") : "bg-card border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {st.label} ({n})
            </button>
          );
        })}
        <button
          onClick={() => setBirthdayMonthOnly((v) => !v)}
          aria-pressed={birthdayMonthOnly}
          className={cn(
            "shrink-0 rounded-full px-3 py-1.5 min-h-11 text-xs font-medium border transition-colors inline-flex items-center gap-1.5 cursor-pointer",
            birthdayMonthOnly
              ? "bg-gold/25 text-gold-text border-gold font-bold shadow-xs"
              : "bg-card border-border text-muted-foreground hover:text-foreground"
          )}
        >
          <span>🎂 Anniversaires du mois</span>
          <span className="font-mono text-[10px]">({all.filter((c) => isBirthdayThisMonth(c.birthDate)).length})</span>
        </button>
      </div>

      {/* Filtres quartiers / communes */}
      {availableDistricts.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 pt-0.5" role="group" aria-label="Filtrer par quartier ou zone">
          <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1 shrink-0 pl-1 mr-0.5">
            <MapPin className="size-3 text-gold-text" aria-hidden="true" />
            Zone :
          </span>
          <button
            onClick={() => setSelectedDistrict(null)}
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
              !selectedDistrict ? "bg-primary/15 text-primary border border-primary/30 font-semibold" : "bg-muted/50 text-muted-foreground hover:text-foreground border border-transparent"
            )}
          >
            Toutes les zones ({all.length})
          </button>
          {availableDistricts.map((dist) => {
            const count = all.filter((c) => c.district === dist).length;
            return (
              <button
                key={dist}
                onClick={() => setSelectedDistrict(selectedDistrict === dist ? null : dist)}
                aria-pressed={selectedDistrict === dist}
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors",
                  selectedDistrict === dist
                    ? "bg-gold/15 text-gold-text border-gold/40 font-semibold"
                    : "bg-card border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {dist} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Table */}
      <Card className="overflow-hidden">
        {clients.error && !clients.data ? (
          typeof navigator !== "undefined" && !navigator.onLine ? (
            <CardContent className="p-8 text-center space-y-3">
              <EmptyState
                label="CRM hors-ligne"
                sub="Le carnet de clientes n'a pas encore été synchronisé sur cet appareil. Connectez-vous à internet pour le charger."
              />
              <Button onClick={clients.refetch} variant="outline" className="text-xs">
                Réessayer la connexion
              </Button>
            </CardContent>
          ) : (
            <CardContent className="p-4"><ErrorState message={`CRM indisponible : ${clients.error}`} onRetry={clients.refetch} /></CardContent>
          )
        ) : clients.loading && !clients.data ? (
          <CardContent className="p-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </CardContent>
        ) : filtered.length === 0 ? (
          <CardContent className="p-8 text-center space-y-3">
            <EmptyState
              label="Aucune cliente trouvée"
              sub={query ? `Aucune fiche ne correspond à « ${query} »` : "Votre carnet de clientes est vide pour ce filtre."}
            />
            <Button
              onClick={() => {
                if (query) {
                  if (/^\+?\d+$/.test(query.replace(/\s/g, ""))) {
                    setCreatePhone(query);
                    setCreateName("");
                  } else {
                    setCreateName(query);
                    setCreatePhone("");
                  }
                }
                setCreateOpen(true);
              }}
              className="k-btn-gold text-primary-foreground font-semibold text-xs gap-1.5"
            >
              <Plus className="size-4" aria-hidden="true" />
              <span>{query ? `Créer la fiche de « ${query} »` : "Enregistrer une première cliente"}</span>
            </Button>
          </CardContent>
        ) : (
          <div className="overflow-x-auto pretty-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="hidden sm:table-cell">Téléphone</TableHead>
                  <TableHead>Dernière visite</TableHead>
                  <TableHead className="text-right">Visites</TableHead>
                  <TableHead className="text-right">Total dépensé</TableHead>
                  <TableHead>Segment</TableHead>
                  <TableHead className="text-right">Accès</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow
                    key={c.id}
                    onClick={() => setOpenId(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setOpenId(c.id);
                      }
                    }}
                    tabIndex={0}
                    aria-label={`Ouvrir la fiche de ${c.name}`}
                    className="cursor-pointer hover:bg-accent/50 focus-visible:bg-accent/50 outline-none transition-colors"
                  >
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <InitialAvatar name={c.name} userId={c.userId} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{c.name}</p>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="truncate text-[10px] text-muted-foreground sm:hidden font-mono">{formatPhoneDisplay(c.phone)}</p>
                            {c.district && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground font-medium">
                                <MapPin className="size-2.5 text-gold-text shrink-0" aria-hidden="true" />
                                <span className="truncate max-w-[120px]">{c.district}</span>
                              </span>
                            )}
                            {c.skinType && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-gold/10 text-gold-text font-medium border border-gold/20 capitalize">
                                Peau {c.skinType}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell font-mono text-xs">{formatPhoneDisplay(c.phone)}</TableCell>
                    <TableCell className="text-xs">{c.lastVisit ? formatDate(c.lastVisit) : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">{c.visitsCount}</TableCell>
                    <TableCell className="text-right"><Money value={c.totalSpent} className="text-xs font-semibold" /></TableCell>
                    <TableCell>{segmentBadge(c.rfmSegment)}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {c.phone && (
                          <button
                            type="button"
                            onClick={() => {
                              const msg = `Bonjour ${c.name.split(" ")[0]} 🌸\nJ'espère que vous allez bien ! Avez-vous besoin d'un conseil pour votre routine ou d'un créneau soin chez nous ? ✨`;
                              openWhatsApp(c.phone, msg);
                            }}
                            className="p-1.5 rounded-lg text-[#25D366] hover:bg-[#25D366]/15 transition-colors"
                            title="Contacter sur WhatsApp"
                            aria-label={`Contacter ${c.name} sur WhatsApp`}
                          >
                            <MessageCircle className="size-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (onOpenSkinDossier) onOpenSkinDossier(c.id);
                            else setOpenId(c.id);
                          }}
                          className="p-1.5 rounded-lg text-primary hover:bg-primary/15 transition-colors"
                          title="Ouvrir le dossier cutané"
                          aria-label={`Dossier de ${c.name}`}
                        >
                          <FolderHeart className="size-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {openId && (
        <ClientSheet
          clientId={openId}
          tenantId={tenantId}
          onClose={() => setOpenId(null)}
          onStartDiagnostic={onStartDiagnostic}
          onRefreshClients={clients.refetch}
          onOpenSkinDossier={onOpenSkinDossier}
        />
      )}

      {/* Dialogue d'enregistrement d'une nouvelle cliente */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading font-black text-lg flex items-center gap-2">
              <UserPlus className="size-5 text-gold-text" aria-hidden="true" />
              Enregistrer une nouvelle cliente
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
              Ajoutez une nouvelle fiche au carnet CRM de votre salon. Elle sera disponible instantanément pour la caisse, l&apos;agenda et les diagnostics en cabine.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateClient} className="space-y-3.5 py-1">
            <div className="space-y-1.5">
              <label htmlFor="create-name" className="text-xs font-semibold block text-foreground">
                Nom complet <span className="text-destructive">*</span>
              </label>
              <Input
                id="create-name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Ex. Aminata Touré"
                className="text-xs"
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="create-phone" className="text-xs font-semibold block text-foreground">
                Téléphone mobile <span className="text-destructive">*</span>
              </label>
              <Input
                id="create-phone"
                value={createPhone}
                onChange={(e) => setCreatePhone(e.target.value)}
                placeholder="Ex. 07 01 02 03 04 ou +225 05..."
                className="text-xs font-mono"
                inputMode="tel"
                required
              />
              <p className="text-[10.5px] text-muted-foreground">Numéro pour le suivi de routine et les rappels WhatsApp.</p>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1.5">
                <label htmlFor="create-skin" className="text-xs font-semibold block text-foreground">
                  Type de peau
                </label>
                <select
                  id="create-skin"
                  value={createSkinType}
                  onChange={(e) => setCreateSkinType(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <option value="mixte">Mixte</option>
                  <option value="grasse">Grasse</option>
                  <option value="seche">Sèche</option>
                  <option value="normale">Normale</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="create-email" className="text-xs font-semibold block text-foreground">
                  Email (optionnel)
                </label>
                <Input
                  id="create-email"
                  type="email"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  placeholder="contact@email.com"
                  className="text-xs"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="create-district" className="text-xs font-semibold block text-foreground">
                Quartier / Commune (optionnel)
              </label>
              <Input
                id="create-district"
                value={createDistrict}
                onChange={(e) => setCreateDistrict(e.target.value)}
                placeholder="Ex. Cocody, Plateau, Marcory, Yopougon, Almadies…"
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="create-notes" className="text-xs font-semibold block text-foreground">
                Notes & Remarques salon
              </label>
              <Textarea
                id="create-notes"
                value={createNotes}
                onChange={(e) => setCreateNotes(e.target.value)}
                placeholder="Préférences de soin, allergies, historique particulier..."
                className="text-xs resize-none h-18"
              />
            </div>

            <DialogFooter className="gap-2 sm:justify-end pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={createBusy}
                className="text-xs"
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={createBusy || createName.trim().length < 2 || createPhone.trim().length < 8}
                className="k-btn-gold text-primary-foreground font-semibold text-xs gap-1.5"
              >
                {createBusy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Enregistrer la cliente
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═════════════ Fiche cliente ═════════════
function ClientSheet({
  clientId,
  tenantId,
  onClose,
  onStartDiagnostic,
  onRefreshClients,
  onOpenSkinDossier,
}: {
  clientId: string;
  tenantId: string;
  onClose: () => void;
  onStartDiagnostic?: (clientId: string) => void;
  onRefreshClients?: () => void;
  onOpenSkinDossier?: (clientId: string) => void;
}) {
  // Notes administratives salon: persistées sur la fiche ClientProfile (base)
  const [note, setNote] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteLoaded, setNoteLoaded] = useState<string | null>(null);

  // Ajustement de prix d'un produit (caisse)
  const [editingItem, setEditingItem] = useState<{
    id: string;
    saleId: string;
    label: string;
    currentPrice: number;
    qty: number;
    saleDate: string;
    reason?: string | null;
  } | null>(null);
  const [editPriceValue, setEditPriceValue] = useState("");
  const [editPriceReason, setEditPriceReason] = useState("");
  const [editPriceBusy, setEditPriceBusy] = useState(false);

  // Archivage / retrait de la cliente du CRM salon
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);

  async function handleArchiveClient() {
    setArchiveBusy(true);
    try {
      await apiDelete(`/api/pro/clients/${clientId}?tenantId=${tenantId}`);
      toast.success("Fiche cliente retirée du carnet du salon");
      setArchiveConfirmOpen(false);
      onClose();
      onRefreshClients?.();
    } catch (e) {
      proToastError(e, "Impossible de retirer la cliente");
    } finally {
      setArchiveBusy(false);
    }
  }

  const detail = useApi<ProClientDetail>(
    () => apiGet<ProClientDetail>(`/api/pro/clients/${clientId}?tenantId=${tenantId}`),
    [clientId, tenantId]
  );

  const d = detail.data;
  const c = d?.client;

  // Initialisation synchronisée avec la fiche cliente en base
  useEffect(() => {
    if (c && noteLoaded !== c.id) {
      setNoteLoaded(c.id);
      setNote(c.notes ?? "");
    }
  }, [c, noteLoaded]);

  async function saveNote() {
    setNoteBusy(true);
    try {
      await apiPatch(`/api/pro/clients/${clientId}?tenantId=${tenantId}`, { notes: note.trim() || null });
      toast.success("Note enregistrée", { description: "Elle apparaîtra sur la fiche de consultation imprimée." });
    } catch (e) {
      proToastError(e, "Enregistrement impossible");
    } finally {
      setNoteBusy(false);
    }
  }

  async function submitPriceUpdate() {
    if (!editingItem) return;
    const priceNum = parseInt(editPriceValue, 10);
    if (isNaN(priceNum) || priceNum < 0) {
      toast.error("Veuillez saisir un prix valide en FCFA");
      return;
    }
    setEditPriceBusy(true);
    try {
      await apiPatch(`/api/pro/clients/${clientId}/purchases/${editingItem.id}?tenantId=${tenantId}`, {
        unitPrice: priceNum,
        reason: editPriceReason.trim() || "Ajusté dans le dossier patient",
      });
      toast.success("Prix ajusté dans le dossier patient", {
        description: `Nouveau prix de ${xof(priceNum)} appliqué à cet achat de ${c?.name}. Le catalogue général reste inchangé.`,
      });
      setEditingItem(null);
      detail.refetch();
      onRefreshClients?.();
    } catch (e) {
      proToastError(e, "Impossible de modifier le prix");
    } finally {
      setEditPriceBusy(false);
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" aria-describedby={undefined} className="w-full sm:max-w-lg overflow-y-auto pretty-scroll p-0">
        {!d || !c ? (
          detail.error ? (
            <div className="p-4">
              {/* Titre sr-only: Radix exige un SheetTitle dès l'ouverture, même en état d'erreur */}
              <SheetTitle className="sr-only">Fiche cliente indisponible</SheetTitle>
              {typeof navigator !== "undefined" && !navigator.onLine ? (
                <div className="py-6 text-center space-y-3">
                  <EmptyState
                    label="Fiche hors-ligne"
                    sub="Cette fiche cliente n'a pas encore été consultée en ligne sur cet appareil."
                  />
                  <Button onClick={detail.refetch} variant="outline" className="text-xs">
                    Réessayer la connexion
                  </Button>
                </div>
              ) : (
                <ErrorState message={`Fiche indisponible : ${detail.error}`} onRetry={detail.refetch} />
              )}
            </div>
          ) : (
            <div className="space-y-3 p-4">
              {/* Titre sr-only: présent dès le squelette de chargement (exigence Radix a11y) */}
              <SheetTitle className="sr-only">Chargement de la fiche cliente…</SheetTitle>
              <Skeleton className="h-20" />
              <Skeleton className="h-24" />
              <Skeleton className="h-64" />
            </div>
          )
        ) : (
          <>
            <SheetHeader className="p-4 pb-3 border-b border-border bg-muted/40">
              <div className="flex items-center gap-3">
                <InitialAvatar name={c.name} userId={c.userId} className="size-12 text-sm" />
                <div className="min-w-0 flex-1">
                  <SheetTitle className="font-heading text-lg leading-tight truncate">{c.name}</SheetTitle>
                  <SheetDescription className="flex flex-wrap items-center gap-2 font-mono text-xs mt-0.5">
                    <span className="flex items-center gap-1">
                      <Phone className="size-3" aria-hidden="true" /> {formatPhoneDisplay(c.phone)}
                    </span>
                    {c.district && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-[10.5px] font-sans font-medium text-foreground/80">
                        <MapPin className="size-3 text-primary" /> {c.district}
                      </span>
                    )}
                    {c.birthDate && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gold/15 text-gold-text text-[10.5px] font-sans font-bold">
                        🎂 {c.birthDate}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const msg = `Bonjour ${c.name} ! 🌸 Nous espérons que vous allez bien. Votre institut Kènè reste à votre entière disposition pour vos soins et routines dermo-cosmétiques. 🌿`;
                        openWhatsApp(c.phone, msg);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#128C7E] dark:text-[#25D366] text-[11px] font-sans font-bold border border-[#25D366]/30 transition-colors cursor-pointer"
                      title="Contacter sur WhatsApp"
                    >
                      <MessageCircle className="size-3 text-[#25D366]" /> WhatsApp
                    </button>
                  </SheetDescription>
                </div>
                {segmentBadge(c.rfmSegment)}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-card px-2 py-1.5">
                  <p className="text-[9px] uppercase text-muted-foreground">Visites</p>
                  <p className="font-mono text-sm font-semibold tabular-nums">{c.visitsCount}</p>
                </div>
                <div className="rounded-lg bg-card px-2 py-1.5">
                  <p className="text-[9px] uppercase text-muted-foreground">Dépensé</p>
                  <p className="font-mono text-sm font-semibold tabular-nums">{xof(c.totalSpent, { compact: true })}</p>
                </div>
                <div className="rounded-lg bg-card px-2 py-1.5">
                  <p className="text-[9px] uppercase text-muted-foreground">Dernière visite</p>
                  <p className="text-sm font-semibold">{c.lastVisit ? formatDate(c.lastVisit, { day: "numeric", month: "short" }) : "—"}</p>
                </div>
              </div>
            </SheetHeader>

            <div className="space-y-4 p-4">
              {/* Alerte Sécurité Maternité (Grossesse ou Allaitement) */}
              {c.pregnant && (
                <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-pink-500/10 border border-pink-500/30 text-pink-800 dark:text-pink-300 text-xs">
                  <Baby className="size-5 shrink-0 text-pink-500 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-bold">⚠️ Alerte Vigilance Cabine : Cliente enceinte / allaitante</p>
                    <p className="text-[11px] leading-relaxed opacity-90">
                      Adapter les protocoles : exclure impérativement les rétinoïdes, acides de fruits à haute concentration (AHA/BHA forts) et les huiles essentielles pures. Privilégier les soins doux, hydratants et apaisants.
                    </p>
                  </div>
                </div>
              )}

              {/* Bouton privilège d'anniversaire direct */}
              {c.birthDate && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 border-gold/40 bg-gold/10 text-gold-text hover:bg-gold/20 font-bold text-xs rounded-xl h-10"
                  onClick={() => {
                    const msg = `Joyeux anniversaire ${c.name} ! 🎂🎉 Toute l'équipe de votre institut partenaire vous souhaite le meilleur. Pour fêter cet événement, nous avons le plaisir de vous offrir une remise privilège sur votre prochain soin en cabine ! 🌿`;
                    openWhatsApp(c.phone, msg);
                  }}
                >
                  <Gift className="size-4 text-gold-text" />
                  Souhaiter son Anniversaire (WhatsApp) · {c.birthDate}
                </Button>
              )}

              {/* Badges Préférences & Budget */}
              {(c.preferredChannel || c.beautyBudget) && (
                <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 rounded-xl bg-muted/50 border border-border/60 text-[11px]">
                  {c.preferredChannel && (
                    <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                      💬 Contact favori : <strong>{c.preferredChannel === "whatsapp" ? "WhatsApp" : c.preferredChannel === "sms" ? "SMS" : "Appel"}</strong>
                    </span>
                  )}
                  {c.preferredChannel && c.beautyBudget && <span className="text-muted-foreground/60">·</span>}
                  {c.beautyBudget && (
                    <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                      💎 Budget soins mensuel : <strong className="text-gold-text">{c.beautyBudget}</strong>
                    </span>
                  )}
                </div>
              )}

              {/* Dossier Cutané, Imagerie HD & Formulations — Espace Dédié */}
              <div className="rounded-2xl border border-gold/40 bg-gradient-to-r from-gold/15 via-gold/5 to-transparent p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="grid size-9 place-items-center rounded-xl bg-gold/20 text-gold-text text-base shrink-0">
                      🔬
                    </span>
                    <div className="min-w-0">
                      <h4 className="font-heading text-xs font-bold text-foreground">
                        Dossier Cutané &amp; Cabine
                      </h4>
                      <p className="text-[10.5px] text-muted-foreground truncate">
                        Biométrie, phototype, imagerie HD, avant/après et formulations d&apos;actifs
                      </p>
                    </div>
                  </div>
                  {onOpenSkinDossier && (
                    <Button
                      size="sm"
                      onClick={() => {
                        onClose();
                        onOpenSkinDossier(c.id);
                      }}
                      className="k-btn-gold text-primary-foreground font-bold text-xs h-8 gap-1.5 shadow-xs shrink-0"
                    >
                      <FolderHeart className="size-3.5" />
                      <span>Consulter</span>
                      <ChevronRight className="size-3" />
                    </Button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-gold/20 text-[10.5px]">
                  <span className="px-2 py-0.5 rounded-md bg-gold/15 text-gold-text font-bold">
                    Phototype {c.fitzpatrick || "V"}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground capitalize">
                    Peau {c.skinType || "mixte"}
                  </span>
                  {c.pregnant && (
                    <span className="px-2 py-0.5 rounded-md bg-pink-500/15 text-pink-600 dark:text-pink-400 font-bold">
                      👶 Maternité
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {d.proDiagnoses.length + d.diagnoses.length} bilan(s) cutané(s) archivé(s)
                  </span>
                </div>
              </div>

              {/* Actions rapides: fiche papier + WhatsApp direct */}
              <div className="grid grid-cols-[1fr_auto] gap-2">
                {/* Fiche de consultation papier — pré-remplie pour cette cliente */}
                <Button
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => window.open(`/api/pro/consultation-sheet?tenantId=${tenantId}&clientId=${clientId}&_t=${Date.now()}`, "_blank")}
                  aria-label={`Imprimer la fiche de consultation pré-remplie de ${c.name}`}
                >
                  <FileDown className="size-4" aria-hidden="true" />
                  Fiche de consultation (PDF)
                </Button>
                {/* — WhatsApp: message pré-rempli au prénom de la cliente */}
                <a
                  href={waLink(c.phone, `Bonjour ${(c.name.split(/\s+/)[0] ?? c.name).trim()} 👋 Ici l'équipe de votre institut. Nous pensons à vous et à votre peau — une question, un conseil, un créneau ? Répondez ici, notre esthéticienne est là pour vous.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-[#3F7D3F]/12 px-3 text-xs font-bold text-[#2E5C2E] ring-1 ring-[#3F7D3F]/30 transition-all hover:bg-[#3F7D3F]/20 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-[#3F7D3F] dark:text-[#8FD18F]"
                  aria-label={`Écrire à ${c.name} sur WhatsApp`}
                >
                  <MessageCircle className="size-4" aria-hidden="true" /> WhatsApp
                </a>
              </div>

              {/* RFM */}
              <section aria-label="Score RFM">
                <h4 className="font-heading text-sm font-bold mb-2">Score RFM</h4>
                <RfmDots client={c} />
              </section>

              {/* Onglets CRM (Ventes, RDV, Commandes, Avis, Notes) */}
              <Tabs defaultValue="sales">
                <TabsList className="w-full">
                  <TabsTrigger value="sales" className="text-[11px] flex-1">Ventes</TabsTrigger>
                  <TabsTrigger value="appts" className="text-[11px] flex-1">RDV</TabsTrigger>
                  <TabsTrigger value="orders" className="text-[11px] flex-1">Commandes</TabsTrigger>
                  <TabsTrigger value="reviews" className="text-[11px] flex-1">Avis</TabsTrigger>
                  <TabsTrigger value="notes" className="text-[11px] flex-1">Notes</TabsTrigger>
                </TabsList>

                <TabsContent value="sales" className="mt-3">
                  {d.sales.length === 0 ? (
                    <EmptyState label="Aucune vente" />
                  ) : (
                    <ul className="space-y-2 max-h-72 overflow-y-auto pretty-scroll pr-1">
                      {d.sales.map((s) => (
                        <li key={s.id} className="rounded-xl border border-border p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-muted-foreground font-mono">{formatDate(s.createdAt)} {formatTime(s.createdAt)}</span>
                            <Money value={s.total} className="text-xs font-semibold" />
                          </div>
                          <div className="mt-1 space-y-1">
                            {s.items.map((it, idx) => (
                              <div key={idx} className="flex items-center justify-between text-xs">
                                <span>{it.qty}× {it.label}</span>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-muted-foreground">{xof(it.total)}</span>
                                  {it.kind === "product" && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingItem({
                                          id: it.id || `${s.id}-${it.label}`,
                                          saleId: it.saleId || s.id,
                                          label: it.label,
                                          currentPrice: it.unitPrice,
                                          qty: it.qty,
                                          saleDate: s.createdAt,
                                          reason: it.customPriceReason,
                                        });
                                        setEditPriceValue(String(it.unitPrice));
                                        setEditPriceReason(it.customPriceReason ?? "");
                                      }}
                                      className="inline-flex items-center gap-0.5 text-[9px] text-gold-text hover:underline cursor-pointer ml-1"
                                      title="Modifier le prix dans le dossier patient"
                                    >
                                      <Pencil className="size-2.5" /> Prix patiente
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>
                <TabsContent value="appts" className="mt-3">
                  {d.appointments.length === 0 ? (
                    <EmptyState label="Aucun rendez-vous" />
                  ) : (
                    <ul className="space-y-2 max-h-72 overflow-y-auto pretty-scroll pr-1">
                      {d.appointments.map((a) => (
                        <li key={a.id} className="flex items-center gap-2 rounded-xl border border-border px-2.5 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium">{a.service.name}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">
                              {formatDate(a.startAt, { weekday: "short", day: "numeric", month: "short" })} {formatTime(a.startAt)}
                            </p>
                          </div>
                          <ApptStatusBadge status={a.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>
                <TabsContent value="orders" className="mt-3">
                  {d.orders.length === 0 ? (
                    <EmptyState label="Aucune commande boutique" sub="Ses commandes de produits Kènè (app) apparaîtront ici." />
                  ) : (
                    <ul className="space-y-2 max-h-72 overflow-y-auto pretty-scroll pr-1">
                      {d.orders.map((o) => (
                        <li key={o.id} className="rounded-xl border border-border p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-muted-foreground font-mono">{formatDate(o.createdAt)} {formatTime(o.createdAt)}</span>
                            <OrderStatusBadge status={o.status} />
                          </div>
                          <p className="mt-1 text-xs">{o.items.map((it) => `${it.qty}× ${it.label}`).join(" · ")}</p>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <span className="text-[10px] text-muted-foreground">{o.couponCode ? `Coupon ${o.couponCode} · ` : ""}Voir onglet Commandes pour le suivi</span>
                            <Money value={o.total} className="text-xs font-semibold" />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>
                <TabsContent value="reviews" className="mt-3">
                  {d.reviews.length === 0 ? (
                    <EmptyState label="Aucun avis" sub="Ses avis après rendez-vous apparaîtront ici." />
                  ) : (
                    <ul className="space-y-2 max-h-72 overflow-y-auto pretty-scroll pr-1">
                      {d.reviews.map((r) => (
                        <li key={r.id} className="rounded-xl border border-border p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-0.5" role="img" aria-label={`Note ${r.rating} sur 5`}>
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star key={i} className={cn("size-3.5", i < r.rating ? "fill-gold text-gold" : "text-border")} aria-hidden="true" />
                              ))}
                            </span>
                            <span className="text-[11px] text-muted-foreground font-mono">{formatDate(r.createdAt)}</span>
                          </div>
                          {r.comment ? <p className="mt-1.5 text-xs leading-relaxed">« {r.comment} »</p> : null}
                          {r.appointment?.service?.name ? (
                            <p className="mt-1 text-[10px] text-muted-foreground">Après : {r.appointment.service.name}</p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>
                <TabsContent value="notes" className="mt-3">
                  <Textarea
                    rows={5}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Notes privées sur la cliente (allergies, préférences, conseils…)"
                    aria-label="Notes privées"
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-[10px] text-muted-foreground">Enregistrée sur la fiche — visible sur tous les postes et la fiche PDF.</p>
                    <Button size="sm" className="gap-1.5 h-8 font-semibold" disabled={noteBusy} onClick={() => void saveNote()}>
                      <Save className="size-3.5" aria-hidden="true" />
                      {noteBusy ? "Enregistrement…" : "Enregistrer"}
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>

              {/* Dialogue d'édition de prix pour un achat cosmétique (exclusif au dossier patient) */}
              {editingItem && (
                <Dialog open onOpenChange={(o) => !o && setEditingItem(null)}>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle className="font-heading flex items-center gap-2 text-base">
                        <Pencil className="size-4 text-gold-text" />
                        Ajuster le prix dans le dossier patient
                      </DialogTitle>
                      <DialogDescription className="text-xs">
                        {editingItem.label} · Achat du {formatDate(editingItem.saleDate)}
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 py-2">
                      <div className="rounded-xl border border-gold/30 bg-gold/10 p-3 text-xs leading-relaxed text-foreground">
                        <p className="flex items-center gap-1.5 font-bold text-gold-text">
                          <Lock className="size-3.5" /> Modification exclusive au dossier patient
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Ce prix est ajusté <strong>uniquement pour cet achat de {c?.name}</strong> dans sa fiche cliente.
                          Le prix catalogue général de l&apos;institut reste <strong>strictement inchangé</strong>.
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-lg bg-muted/50 p-2">
                          <span className="text-[10px] uppercase text-muted-foreground">Prix actuel facturé</span>
                          <p className="font-mono text-sm font-semibold">{xof(editingItem.currentPrice)}</p>
                        </div>
                        <div className="rounded-lg bg-muted/50 p-2">
                          <span className="text-[10px] uppercase text-muted-foreground">Quantité</span>
                          <p className="font-mono text-sm font-semibold">{editingItem.qty} unité(s)</p>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium">Nouveau prix unitaire (FCFA) *</label>
                        <Input
                          type="number"
                          min="0"
                          step="500"
                          value={editPriceValue}
                          onChange={(e) => setEditPriceValue(e.target.value)}
                          placeholder="Ex: 8500"
                          className="font-mono font-semibold"
                          autoFocus
                        />
                        {editPriceValue && !isNaN(parseInt(editPriceValue, 10)) && (
                          <p className="text-[10px] text-muted-foreground">
                            Nouveau total pour {editingItem.qty} unité(s) :{" "}
                            <strong className="text-foreground">{xof(parseInt(editPriceValue, 10) * editingItem.qty)}</strong>
                          </p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium">Motif de l&apos;ajustement (optionnel)</label>
                        <Input
                          value={editPriceReason}
                          onChange={(e) => setEditPriceReason(e.target.value)}
                          placeholder="Ex: Tarif fidélité, pack routine cabine, remise spéciale…"
                        />
                      </div>
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0">
                      <Button variant="outline" size="sm" onClick={() => setEditingItem(null)} disabled={editPriceBusy}>
                        Annuler
                      </Button>
                      <Button size="sm" onClick={() => void submitPriceUpdate()} disabled={editPriceBusy} className="gap-1.5 font-semibold">
                        {editPriceBusy ? "Enregistrement…" : "Valider le nouveau prix"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}



              {/* Option d'archivage / retrait de la cliente du CRM salon */}
              <div className="pt-4 mt-2 border-t border-border flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">
                  Retirer de mon carnet d&apos;institut
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5 font-bold"
                  onClick={() => setArchiveConfirmOpen(true)}
                >
                  <Trash2 className="size-3.5" />
                  Archiver du salon
                </Button>
              </div>

              {/* Dialogue de confirmation d'archivage CRM */}
              <AlertDialog open={archiveConfirmOpen} onOpenChange={setArchiveConfirmOpen}>
                <AlertDialogContent className="sm:max-w-md">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="font-heading font-bold text-base flex items-center gap-2 text-destructive">
                      <AlertTriangle className="size-4 shrink-0" />
                      Retirer {c?.name ?? "cette cliente"} de votre salon ?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-xs leading-relaxed space-y-1.5">
                      <span className="block">
                        Cette action retire la cliente du carnet de votre institut et efface ses notes internes.
                      </span>
                      <span className="block text-muted-foreground text-[11px]">
                        Conformément aux normes comptables SYSCOHADA, les ventes de caisse et reçus passés restent archivés pour le bilan de l&apos;institut.
                      </span>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={archiveBusy}>Annuler</AlertDialogCancel>
                    <Button
                      variant="destructive"
                      disabled={archiveBusy}
                      onClick={handleArchiveClient}
                      className="h-10 text-xs font-bold gap-1.5"
                    >
                      {archiveBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                      Confirmer le retrait
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </>
        )}
      </SheetContent>

    </Sheet>
  );
}
