"use client";
// Kènè Pro — CRM: recherche, segments RFM, fiche cliente (ventes, RDV,
// commandes boutique, avis, diagnostics IA, diagnostics en institut, notes)
// — WhatsApp direct depuis la fiche cliente: message de prise de
// contact pré-rempli (wa.me), même mécanique que les relances du Fil du Retour.
import { useEffect, useMemo, useState } from "react";
import { FileDown, Lock, MessageCircle, Phone, Search, Sparkles, Stethoscope, Users, Wallet, ChevronDown, Save, Star, Pencil, Plus, ShoppingBag, FlaskConical, PackageCheck, Trash2, AlertTriangle, Loader2, UserPlus, Baby, Calendar, Gift, MapPin } from "lucide-react";
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
import { xof, formatDate, formatTime, scoreVar } from "@/lib/kene/format";
import { rfmScore, RFM_SEGMENT_STYLES } from "@/lib/kene/rfm";
import { RFM_SEGMENTS } from "@/lib/kene/types";
import type { BodyZone } from "@/lib/kene/types";
import { parseDiagnosis, diagImgSrc } from "@/components/kene/client/types";
import { parseProDiagnosis } from "@/lib/kene/questionnaire";
import { waLink } from "@/lib/kene/followups";
import { openWhatsApp } from "@/lib/kene/whatsapp-relay";
import { SkinTwinCard, type TwinEntry } from "@/components/kene/skintwin/SkinTwinCard";
import { ProEvolutionCard } from "@/components/kene/evolution/ProEvolutionCard";
import { BeforeAfterSlider } from "@/components/kene/evolution/BeforeAfterSlider";
import { useApi } from "./useApi";
import { ApptStatusBadge, EmptyState, ErrorState, InitialAvatar, Money, SectionHeader, KenteTop } from "./ui-bits";
import { ResultView } from "./DiagnosticsSection";
import { OrderStatusBadge } from "./OrdersSection";
import { proToastError } from "./ProApp";
import { DEFAULT_FALLBACK_CLIENTS } from "@/lib/kene/fallback-catalog";
import type { ProClient, ProClientDetail, ProDiagnosisItem } from "./types";

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
}: {
  tenantId: string;
  onStartDiagnostic?: (clientId: string) => void;
  createClientNonce?: number;
}) {
  const [query, setQuery] = useState("");
  const q = useDebounced(query);
  const [segment, setSegment] = useState<string | null>(null);
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
  const [createSkinType, setCreateSkinType] = useState<string>("mixte");
  const [createNotes, setCreateNotes] = useState("");
  const [createBusy, setCreateBusy] = useState(false);

  const clients = useApi<ProClient[]>(
    async () => {
      if (!tenantId) return [];
      try {
        const res = await apiGet<{ clients: ProClient[] }>(
          `/api/pro/clients?tenantId=${tenantId}${q ? `&q=${encodeURIComponent(q)}` : ""}`
        );
        return res.clients ?? [];
      } catch (err) {
        // En cas d'échec (ex: recherche hors-ligne non présente dans le cache),
        // on tente de charger la liste complète en cache et de filtrer localement
        if (q) {
          try {
            const fallbackRes = await apiGet<{ clients: ProClient[] }>(`/api/pro/clients?tenantId=${tenantId}`);
            const allClients = fallbackRes.clients ?? [];
            const term = q.toLowerCase().trim();
            return allClients.filter(
              (c) =>
                c.name.toLowerCase().includes(term) ||
                (c.phone && c.phone.includes(term))
            );
          } catch {
            // continuer vers throw originel
          }
        }
        throw err;
      }
    },
    [tenantId, q],
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
        skinType: createSkinType || undefined,
        notes: createNotes.trim() || undefined,
      });
      setCreateOpen(false);
      setCreateName("");
      setCreatePhone("");
      setCreateEmail("");
      setCreateNotes("");
      await clients.refetch();
      setOpenId(res.client.id);
      toast.success(
        res.reused
          ? `Fiche cliente existante retrouvée : ${res.client.name}`
          : `Nouvelle cliente enregistrée : ${res.client.name} ✨`
      );
    } catch (err) {
      proToastError(err, "Impossible d'enregistrer la cliente");
    } finally {
      setCreateBusy(false);
    }
  }

  const filtered = (clients.data ?? []).filter((c) => (segment ? c.rfmSegment === segment : true));
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
          { icon: <Sparkles className="size-4" />, label: "Champions RFM", value: String(champions) },
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
      </div>

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
              sub={q ? `Aucune fiche ne correspond à « ${q} »` : "Votre carnet de clientes est vide pour ce filtre."}
            />
            <Button
              onClick={() => {
                if (q) {
                  if (/^\+?\d+$/.test(q.replace(/\s/g, ""))) {
                    setCreatePhone(q);
                    setCreateName("");
                  } else {
                    setCreateName(q);
                    setCreatePhone("");
                  }
                }
                setCreateOpen(true);
              }}
              className="k-btn-gold text-primary-foreground font-semibold text-xs gap-1.5"
            >
              <Plus className="size-4" aria-hidden="true" />
              <span>{q ? `Créer la fiche de « ${q} »` : "Enregistrer une première cliente"}</span>
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
                    className="cursor-pointer hover:bg-accent/50 focus-visible:bg-accent/50 outline-none"
                  >
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <InitialAvatar name={c.name} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{c.name}</p>
                          <p className="truncate text-[10px] text-muted-foreground sm:hidden font-mono">{c.phone}</p>
                          {c.skinType && <p className="hidden lg:block text-[10px] text-muted-foreground capitalize">Peau {c.skinType}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell font-mono text-xs">{c.phone}</TableCell>
                    <TableCell className="text-xs">{c.lastVisit ? formatDate(c.lastVisit) : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">{c.visitsCount}</TableCell>
                    <TableCell className="text-right"><Money value={c.totalSpent} className="text-xs font-semibold" /></TableCell>
                    <TableCell>{segmentBadge(c.rfmSegment)}</TableCell>
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
}: {
  clientId: string;
  tenantId: string;
  onClose: () => void;
  onStartDiagnostic?: (clientId: string) => void;
  onRefreshClients?: () => void;
}) {
  // Notes PRIVÉES: persistées sur la fiche ClientProfile (base)
  const [note, setNote] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteLoaded, setNoteLoaded] = useState<string | null>(null);

  // Produits cosmétiques utilisés par la cliente (routine quotidienne)
  const [cosmeticsUsed, setCosmeticsUsed] = useState("");
  const [cosmeticsBusy, setCosmeticsBusy] = useState(false);

  // Observations sur les composants des produits achetés en institut
  const [productObservations, setProductObservations] = useState("");
  const [obsBusy, setObsBusy] = useState(false);

  // Ajustement de prix d'un produit cosmétique acheté (exclusif au dossier patient)
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

  // Enregistrement direct d'un achat cosmétique au dossier patient
  const [showAddPurchase, setShowAddPurchase] = useState(false);
  const [newProdLabel, setNewProdLabel] = useState("");
  const [newProdPrice, setNewProdPrice] = useState("");
  const [newProdQty, setNewProdQty] = useState(1);
  const [newProdMethod, setNewProdMethod] = useState<"cash" | "wave" | "orange" | "card">("cash");
  const [newProdReason, setNewProdReason] = useState("");
  const [addPurchaseBusy, setAddPurchaseBusy] = useState(false);

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
      setCosmeticsUsed(c.cosmeticsUsed ?? "");
      setProductObservations(c.productObservations ?? "");
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

  async function saveCosmeticsUsed() {
    setCosmeticsBusy(true);
    try {
      await apiPatch(`/api/pro/clients/${clientId}?tenantId=${tenantId}`, {
        cosmeticsUsed: cosmeticsUsed.trim() || null,
      });
      toast.success("Routine cosmétique enregistrée", {
        description: "Les produits utilisés par la cliente sont conservés au dossier patient.",
      });
      detail.refetch();
      onRefreshClients?.();
    } catch (e) {
      proToastError(e, "Enregistrement impossible");
    } finally {
      setCosmeticsBusy(false);
    }
  }

  async function saveProductObservations() {
    setObsBusy(true);
    try {
      await apiPatch(`/api/pro/clients/${clientId}?tenantId=${tenantId}`, {
        productObservations: productObservations.trim() || null,
      });
      toast.success("Observations composants enregistrées", {
        description: "Les notes formulatoires et de tolérance sont conservées dans le dossier.",
      });
      detail.refetch();
      onRefreshClients?.();
    } catch (e) {
      proToastError(e, "Enregistrement impossible");
    } finally {
      setObsBusy(false);
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

  async function submitAddPurchase() {
    if (!newProdLabel.trim()) {
      toast.error("Veuillez indiquer le nom du produit cosmétique");
      return;
    }
    const priceNum = parseInt(newProdPrice, 10);
    if (isNaN(priceNum) || priceNum < 0) {
      toast.error("Veuillez saisir un prix unitaire valide");
      return;
    }
    setAddPurchaseBusy(true);
    try {
      await apiPost(`/api/pro/clients/${clientId}/purchases?tenantId=${tenantId}`, {
        label: newProdLabel.trim(),
        unitPrice: priceNum,
        qty: newProdQty,
        paymentMethod: newProdMethod,
        reason: newProdReason.trim() || "Achat enregistré au dossier patient",
      });
      toast.success("Achat cosmétique consigné", {
        description: `${newProdLabel} ajouté au suivi d'achat de la patiente.`,
      });
      setShowAddPurchase(false);
      setNewProdLabel("");
      setNewProdPrice("");
      setNewProdQty(1);
      setNewProdReason("");
      detail.refetch();
      onRefreshClients?.();
    } catch (e) {
      proToastError(e, "Impossible d'enregistrer l'achat");
    } finally {
      setAddPurchaseBusy(false);
    }
  }

  // Suivi spécifique de tous les achats de produits cosmétiques en institut
  const cosmeticPurchases = useMemo(() => {
    if (!d?.sales) return [];
    const list: Array<{
      id: string;
      saleId: string;
      label: string;
      qty: number;
      unitPrice: number;
      total: number;
      productId?: string | null;
      productBotanicals?: string | null;
      customPriceReason?: string | null;
      saleDate: string;
      paymentMethod: string;
    }> = [];

    for (const s of d.sales) {
      for (const it of s.items ?? []) {
        if (it.kind === "product") {
          list.push({
            id: it.id || `${s.id}-${it.label}`,
            saleId: it.saleId || s.id,
            label: it.label,
            qty: it.qty,
            unitPrice: it.unitPrice,
            total: it.total,
            productId: it.productId,
            productBotanicals: it.productBotanicals || (it as { product?: { botanicals?: string } }).product?.botanicals,
            customPriceReason: it.customPriceReason,
            saleDate: s.createdAt,
            paymentMethod: s.paymentMethod,
          });
        }
      }
    }
    return list;
  }, [d?.sales]);

  function handleInsertPurchasedComponents() {
    const names = new Set<string>();
    const botanicals = new Set<string>();
    for (const p of cosmeticPurchases) {
      names.add(p.label);
      if (p.productBotanicals) {
        p.productBotanicals
          .split(/[,·+]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((b) => botanicals.add(b));
      }
    }
    const prodList = Array.from(names).join(" · ") || "Produits cosmétiques achetés en institut";
    const botList = Array.from(botanicals).join(", ") || "Karité brut, Moringa, Baobab, Bissap";

    const snippet = `[COMPOSANTS DES PRODUITS ACHETÉS EN INSTITUT : ${prodList}]
• Principes actifs & botaniques : ${botList}
• Tolérance cutanée constatée : Excellente tolérance, aucune irritation
• Synergie & conseils d'application : Utilisation régulière le soir sur peau propre
• Précautions spécifiques notées par l'institut : `;

    setProductObservations((prev) => (prev ? `${prev}\n\n${snippet}` : snippet));
    toast.info("Composants insérés", {
      description: "Les actifs des cosmétiques achetés ont été insérés dans la zone d'observation.",
    });
  }

 /* Jumeau de Peau — agrégation 3D des diagnostics de la cliente (toutes zones) */
  const twinEntries = useMemo<TwinEntry[]>(
    () =>
      (d?.diagnoses ?? []).map((dg) => {
        const r = parseDiagnosis(dg.resultJson);
        return {
          id: dg.id,
          zone: dg.zone as BodyZone,
          score: dg.scoreGlobal,
          fitz: r?.fitzpatrick_estime,
          marks: r?.zones_marquages ?? [],
          date: dg.createdAt,
          indicators: r?.indicateurs,
        };
      }),
    [d?.diagnoses],
  );

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
                <InitialAvatar name={c.name} className="size-12 text-sm" />
                <div className="min-w-0 flex-1">
                  <SheetTitle className="font-heading text-lg leading-tight truncate">{c.name}</SheetTitle>
                  <SheetDescription className="flex flex-wrap items-center gap-2 font-mono text-xs mt-0.5">
                    <span className="flex items-center gap-1">
                      <Phone className="size-3" aria-hidden="true" /> {c.phone}
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
                        const msg = `Bonjour ${c.name} ! 🌸 Nous espérons que vous allez bien. Votre institut Kènè reste à votre entière disposition pour vos soins et routines dermo-botaniques. ✨`;
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
                    const msg = `Joyeux anniversaire ${c.name} ! 🎂🎉 Toute l'équipe de votre institut partenaire vous souhaite le meilleur. Pour fêter cet événement, nous avons le plaisir de vous offrir une remise privilège sur votre prochain soin en cabine ! ✨`;
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

              {/* Actions rapides: fiche papier + WhatsApp direct */}
              <div className="grid grid-cols-[1fr_auto] gap-2">
                {/* Fiche de consultation papier — pré-remplie pour cette cliente */}
                <Button
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => window.open(`/api/pro/consultation-sheet?tenantId=${tenantId}&clientId=${clientId}`, "_blank")}
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

              {/* Diagnostics réalisés EN INSTITUT — l'activité de l'entreprise */}
              <section aria-label="Diagnostics en institut">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h4 className="font-heading text-sm font-bold">Diagnostics en institut ({d.proDiagnoses.length})</h4>
                  {onStartDiagnostic && (
                    <Button
                      size="sm"
                      onClick={() => {
                        onClose();
                        onStartDiagnostic(c.id);
                      }}
                      className="gap-1.5 font-semibold"
                      aria-label={`Lancer un diagnostic en cabine pour ${c.name}`}
                    >
                      <Stethoscope className="size-3.5" aria-hidden="true" />
                      Lancer un diagnostic
                    </Button>
                  )}
                </div>
                {d.proDiagnoses.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Aucun diagnostic en cabine pour cette cliente — l&apos;entretien questionnaire prend 3 minutes.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {d.proDiagnoses.map((pd) => (
                      <InstituteDiagRow key={pd.id} item={pd} />
                    ))}
                  </ul>
                )}
              </section>

              {/* Diagnostics liés — soumis au partage explicite de la
             cliente (case à la réservation ou carte « Partage » de son app). */}
              {c.userId && !d.scansShared && (
                <section aria-label="Diagnostics Kènè non partagés">
                  <div className="flex items-start gap-2.5 rounded-xl border border-dashed border-border bg-muted/40 p-3">
                    <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      <strong className="text-foreground">{(c.name.split(/\s+/)[0] ?? c.name)} n&apos;a pas partagé ses self-scans.</strong>{" "}
                      Elle a un compte Kènè mais choisit, institut par institut, qui voit l&apos;historique de ses
                      diagnostics — c&apos;est elle qui active le partage depuis son app. Son profil de base (type de
                      peau, phototype) reste partagé avec votre institut, et vos diagnostics cabine restent enregistrés.
                    </p>
                  </div>
                </section>
              )}
              {c.userId && d.scansShared && (
                <section aria-label="Diagnostics IA liés">
                  <h4 className="font-heading text-sm font-bold mb-2">Diagnostics Kènè ({d.diagnoses.length})</h4>
                  {/* Jumeau de Peau — agrégation 3D de tous les diagnostics de la cliente */}
                  {twinEntries.length > 0 && <SkinTwinCard context="pro" entries={twinEntries} className="mb-4" />}
                  {/* Fil du Temps — courbe d'évolution + lecture pro (séries calculées localement) */}
                  {d.diagnoses.length > 0 && <ProEvolutionCard rows={d.diagnoses} className="mb-4" />}
                  {/* Curseur Comparatif Avant / Après */}
                  {d.diagnoses.length >= 2 && (() => {
                    const sorted = [...d.diagnoses].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                    const beforeDiag = sorted[0];
                    const afterDiag = sorted[sorted.length - 1];
                    return (
                      <div className="mb-4 space-y-1.5">
                        <h5 className="font-heading text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                          <Sparkles className="size-3 text-gold-text" /> Comparatif Avant / Après (Tactile)
                        </h5>
                        <BeforeAfterSlider
                          before={{
                            imageUrl: diagImgSrc(beforeDiag.imageData),
                            label: "Bilan J0 Initial",
                            date: beforeDiag.createdAt,
                            score: beforeDiag.scoreGlobal,
                          }}
                          after={{
                            imageUrl: diagImgSrc(afterDiag.imageData),
                            label: "Bilan Récent",
                            date: afterDiag.createdAt,
                            score: afterDiag.scoreGlobal,
                          }}
                          showSpectralUvToggle={true}
                        />
                      </div>
                    );
                  })()}
                  {d.diagnoses.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Aucun diagnostic pour cette cliente.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {d.diagnoses.map((dg) => {
                        const img = diagImgSrc(dg.imageData);
                        return (
                          <div key={dg.id} className="overflow-hidden rounded-xl border border-border bg-card">
                            <div className="aspect-square bg-muted">
                              <img src={img} alt={`Diagnostic ${dg.zone}`} className="size-full object-cover" />
                            </div>
                            <div className="p-1.5 text-center">
                              <p className="text-[10px] font-medium capitalize">{dg.zone.replace("_", " ")}</p>
                              <p className="font-mono text-xs font-bold" style={{ color: scoreVar(dg.scoreGlobal) }}>{dg.scoreGlobal}/100</p>
                              <p className="text-[9px] text-muted-foreground">{formatDate(dg.createdAt, { day: "numeric", month: "short" })}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {/* Onglets */}
              <Tabs defaultValue="cosmetics">
                <TabsList className="w-full">
                  <TabsTrigger value="cosmetics" className="text-[11px] flex-1 font-semibold flex items-center justify-center gap-1">
                    <Sparkles className="size-3 text-gold-text shrink-0" /> Cosmétiques
                  </TabsTrigger>
                  <TabsTrigger value="sales" className="text-[11px] flex-1">Ventes</TabsTrigger>
                  <TabsTrigger value="appts" className="text-[11px] flex-1">RDV</TabsTrigger>
                  <TabsTrigger value="orders" className="text-[11px] flex-1">Commandes</TabsTrigger>
                  <TabsTrigger value="reviews" className="text-[11px] flex-1">Avis</TabsTrigger>
                  <TabsTrigger value="notes" className="text-[11px] flex-1">Notes</TabsTrigger>
                </TabsList>

                {/* Onglet Cosmétiques (Produits utilisés, Suivi des achats avec prix modifiable, Observations composants) */}
                <TabsContent value="cosmetics" className="mt-3 space-y-4">
                  {/* 1. Produits cosmétiques utilisés par la cliente (Routine quotidienne) */}
                  <Card className="overflow-hidden border-border bg-card">
                    <CardContent className="p-3.5 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="grid size-7 place-items-center rounded-lg bg-gold/15 text-gold-text shrink-0">
                            <Sparkles className="size-3.5" />
                          </span>
                          <div>
                            <h5 className="font-heading text-xs font-bold leading-tight">Cosmétiques utilisés par la cliente</h5>
                            <p className="text-[10px] text-muted-foreground">Soins appliqués à domicile (nettoyant, sérum, crème, protection solaire…)</p>
                          </div>
                        </div>
                        {cosmeticsUsed.trim() ? (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[9px] px-1.5 shrink-0">
                            Routine renseignée
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[9px] px-1.5 shrink-0">
                            À renseigner
                          </Badge>
                        )}
                      </div>

                      <Textarea
                        rows={3}
                        value={cosmeticsUsed}
                        onChange={(e) => setCosmeticsUsed(e.target.value)}
                        placeholder="Ex: Matin : Savon doux Karité, Sérum hydratant acide hyaluronique, Crème solaire SPF50. Soir : Huile Baobab démaquillante, Baume nuit nourrissant…"
                        className="text-xs leading-relaxed"
                        aria-label="Produits cosmétiques utilisés au quotidien"
                      />

                      {/* Suggestions rapides */}
                      <div className="space-y-1">
                        <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Ajouts rapides :</span>
                        <div className="flex flex-wrap gap-1">
                          {[
                            "Sérum éclat Moringa",
                            "Baume nuit Karité bio",
                            "Savon noir traditionnel",
                            "Gel nettoyant doux",
                            "Crème solaire SPF50",
                            "Huile sèche Baobab",
                            "Brume tonique Néré",
                            "Gommage doux Bissap",
                          ].map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => {
                                setCosmeticsUsed((prev) => (prev ? `${prev.trim()}, ${tag}` : tag));
                              }}
                              className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-gold/15 hover:text-gold-text hover:border-gold/30 transition-colors cursor-pointer"
                            >
                              + {tag}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <p className="text-[10px] text-muted-foreground">Enregistré au dossier · Imprimé sur la fiche PDF</p>
                        <Button
                          size="sm"
                          className="gap-1.5 h-8 font-semibold text-xs"
                          disabled={cosmeticsBusy}
                          onClick={() => void saveCosmeticsUsed()}
                        >
                          <Save className="size-3.5" aria-hidden="true" />
                          {cosmeticsBusy ? "Enregistrement…" : "Enregistrer la routine"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* 2. Suivi de chaque achat cosmétique effectué en institut avec prix modifiable */}
                  <Card className="overflow-hidden border-border bg-card">
                    <CardContent className="p-3.5 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="grid size-7 place-items-center rounded-lg bg-primary/15 text-primary shrink-0">
                            <ShoppingBag className="size-3.5" />
                          </span>
                          <div>
                            <h5 className="font-heading text-xs font-bold leading-tight">Suivi des achats cosmétiques en institut</h5>
                            <p className="text-[10px] text-muted-foreground">Prix modifiable exclusivement dans le dossier patient (catalogue général protégé)</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge variant="outline" className="text-[9px] px-1.5 font-mono">
                            {cosmeticPurchases.length} achat{cosmeticPurchases.length > 1 ? "s" : ""}
                          </Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] gap-1 px-2 border-primary/30 text-primary hover:bg-primary/10"
                            onClick={() => setShowAddPurchase(true)}
                          >
                            <Plus className="size-3" /> Ajouter
                          </Button>
                        </div>
                      </div>

                      {cosmeticPurchases.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border p-4 text-center space-y-2">
                          <p className="text-xs text-muted-foreground">Aucun achat de produit cosmétique consigné pour cette cliente.</p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs gap-1"
                            onClick={() => setShowAddPurchase(true)}
                          >
                            <Plus className="size-3.5" /> Enregistrer un achat cosmétique
                          </Button>
                        </div>
                      ) : (
                        <ul className="space-y-2 max-h-72 overflow-y-auto pretty-scroll pr-1">
                          {cosmeticPurchases.map((it) => (
                            <li key={it.id} className="rounded-xl border border-border bg-muted/20 p-2.5 space-y-1.5">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-medium text-foreground truncate">{it.label}</p>
                                  <p className="text-[10px] text-muted-foreground font-mono">
                                    {formatDate(it.saleDate, { day: "numeric", month: "short", year: "numeric" })} · {it.qty} unité{it.qty > 1 ? "s" : ""}
                                    {it.paymentMethod ? ` · ${it.paymentMethod}` : ""}
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="font-mono text-xs font-bold text-gold-text">{xof(it.total)}</p>
                                  <p className="font-mono text-[9px] text-muted-foreground">({xof(it.unitPrice)} / u)</p>
                                </div>
                              </div>

                              {it.productBotanicals && (
                                <p className="text-[10px] text-muted-foreground bg-muted/40 rounded px-1.5 py-0.5 truncate">
                                  🌿 <span className="font-medium text-foreground">Composants :</span> {it.productBotanicals}
                                </p>
                              )}

                              {it.customPriceReason && (
                                <p className="text-[9px] text-gold-text bg-gold/10 rounded px-1.5 py-0.5 flex items-center gap-1">
                                  <Lock className="size-2.5 shrink-0" /> Prix dossier patient : {it.customPriceReason}
                                </p>
                              )}

                              <div className="pt-1 flex justify-end">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[10px] gap-1 px-2 text-muted-foreground hover:text-foreground hover:border-gold/50 cursor-pointer"
                                  onClick={() => {
                                    setEditingItem({
                                      id: it.id,
                                      saleId: it.saleId,
                                      label: it.label,
                                      currentPrice: it.unitPrice,
                                      qty: it.qty,
                                      saleDate: it.saleDate,
                                      reason: it.customPriceReason,
                                    });
                                    setEditPriceValue(String(it.unitPrice));
                                    setEditPriceReason(it.customPriceReason ?? "");
                                  }}
                                  title="Modifier le prix facturé à cette cliente uniquement"
                                >
                                  <Pencil className="size-2.5 text-gold-text" /> Modifier le prix patiente
                                </Button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>

                  {/* 3. Zone de texte observation pour noter les composants des produits achetés */}
                  <Card className="overflow-hidden border-border bg-card">
                    <CardContent className="p-3.5 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="grid size-7 place-items-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
                            <FlaskConical className="size-3.5" />
                          </span>
                          <div>
                            <h5 className="font-heading text-xs font-bold leading-tight">Observations composants des produits achetés</h5>
                            <p className="text-[10px] text-muted-foreground">Composants, actifs botaniques, tolérance cutanée & conseils</p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px] gap-1 px-2 border-gold/30 text-gold-text hover:bg-gold/10 cursor-pointer"
                          onClick={handleInsertPurchasedComponents}
                          title="Extraire et insérer les actifs des cosmétiques achetés"
                        >
                          <Sparkles className="size-3" /> Insérer composants
                        </Button>
                      </div>

                      <Textarea
                        rows={4}
                        value={productObservations}
                        onChange={(e) => setProductObservations(e.target.value)}
                        placeholder="Notez ici les composants des différents cosmétiques achetés dans votre institut (Karité, Moringa, acide hyaluronique, filtres minéraux…), tolérance observée, posologie et précautions formulatoires…"
                        className="text-xs font-sans leading-relaxed"
                        aria-label="Observations sur les composants des produits cosmétiques achetés"
                      />

                      <div className="flex items-center justify-between pt-1">
                        <p className="text-[10px] text-muted-foreground">Visible sur tous les postes · Synchronisé avec la fiche PDF</p>
                        <Button
                          size="sm"
                          className="gap-1.5 h-8 font-semibold text-xs"
                          disabled={obsBusy}
                          onClick={() => void saveProductObservations()}
                        >
                          <Save className="size-3.5" aria-hidden="true" />
                          {obsBusy ? "Enregistrement…" : "Enregistrer les observations"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

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

              {/* Dialogue d'ajout d'achat cosmétique direct */}
              {showAddPurchase && (
                <Dialog open onOpenChange={(o) => !o && setShowAddPurchase(false)}>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle className="font-heading flex items-center gap-2 text-base">
                        <ShoppingBag className="size-4 text-gold-text" />
                        Enregistrer un achat cosmétique au dossier
                      </DialogTitle>
                      <DialogDescription className="text-xs">
                        Consigner un produit cosmétique pour {c?.name} avec prix sur-mesure.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 py-2">
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Nom du produit cosmétique *</label>
                        <Input
                          value={newProdLabel}
                          onChange={(e) => setNewProdLabel(e.target.value)}
                          placeholder="Ex: Baume Nuit Karité Bio 100ml"
                          autoFocus
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-xs font-medium">Prix unitaire facturé (FCFA) *</label>
                          <Input
                            type="number"
                            min="0"
                            step="500"
                            value={newProdPrice}
                            onChange={(e) => setNewProdPrice(e.target.value)}
                            placeholder="10000"
                            className="font-mono font-semibold"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium">Quantité</label>
                          <Input
                            type="number"
                            min="1"
                            max="50"
                            value={newProdQty}
                            onChange={(e) => setNewProdQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                            className="font-mono"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium">Règlement</label>
                        <div className="grid grid-cols-4 gap-1.5">
                          {(["cash", "wave", "orange", "card"] as const).map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setNewProdMethod(m)}
                              className={cn(
                                "rounded-lg border px-2 py-1.5 text-xs font-semibold capitalize transition-colors cursor-pointer",
                                newProdMethod === m
                                  ? "border-primary bg-primary/15 text-primary"
                                  : "border-border bg-card text-muted-foreground hover:bg-muted"
                              )}
                            >
                              {m === "cash" ? "Espèces" : m}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium">Motif / Note (optionnel)</label>
                        <Input
                          value={newProdReason}
                          onChange={(e) => setNewProdReason(e.target.value)}
                          placeholder="Ex: Tarif sur-mesure dermo-conseil"
                        />
                      </div>
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0">
                      <Button variant="outline" size="sm" onClick={() => setShowAddPurchase(false)} disabled={addPurchaseBusy}>
                        Annuler
                      </Button>
                      <Button size="sm" onClick={() => void submitAddPurchase()} disabled={addPurchaseBusy} className="gap-1.5 font-semibold">
                        {addPurchaseBusy ? "Enregistrement…" : "Enregistrer l'achat"}
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

// ── Rangée diagnostic en institut (dépliable → résultat complet) ──
function InstituteDiagRow({ item }: { item: ProDiagnosisItem }) {
  const [open, setOpen] = useState(false);
  const result = useMemo(() => parseProDiagnosis(item.resultJson), [item.resultJson]);
  const flags = result?.questionnaire?.flags ?? [];

  return (
    <li className="rounded-xl border border-border overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-accent/50 transition-colors"
        aria-label={`Diagnostic en institut du ${new Date(item.createdAt).toLocaleDateString("fr-FR")} — score ${item.scoreGlobal}/100 — ${flags.length} vigilance(s)`}
      >
        <span
          className="grid size-10 shrink-0 place-items-center rounded-full border-2 font-mono text-xs font-bold"
          style={{ borderColor: scoreVar(item.scoreGlobal), color: scoreVar(item.scoreGlobal) }}
        >
          {item.scoreGlobal}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">
            <span className="capitalize">{item.zone.replace("_", " ")}</span>
            {item.practitioner ? ` · ${item.practitioner}` : ""}
          </p>
          <p className="text-[10px] text-muted-foreground font-mono">
            {formatDate(item.createdAt, { day: "2-digit", month: "short", year: "2-digit" })}
            {item.vlmUsed ? " · photo IA" : " · entretien"}
            {flags.length > 0 ? ` · ${flags.length} vigilance${flags.length > 1 ? "s" : ""}` : ""}
          </p>
        </div>
        <ChevronDown className={cn("size-4 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && result && (
        <div className="border-t border-border bg-muted/20 p-3">
          <ResultView result={result} photo={item.photoData ?? null} meta={{ zone: item.zone, createdAt: item.createdAt, practitioner: item.practitioner }} />
        </div>
      )}
    </li>
  );
}
