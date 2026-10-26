"use client";
// Kènè Cliente — « Partage avec mes instituts »
// La cliente choisit son institut référent et décide qui a accès à ses bilans cutanés.
// Permet de cocher son institut partenaire, partager ses diagnostics de peau,
// échanger en direct sur WhatsApp et réserver ses soins cabine.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  Check,
  Loader2,
  Lock,
  Share2,
  MessageCircle,
  CalendarPlus,
  Search,
  MapPin,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, apiPatch } from "@/lib/kene/api";
import { formatDate } from "@/lib/kene/format";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  openWhatsApp,
  openWhatsAppAppointmentInquiry,
  openWhatsAppInstituteContact,
  buildWhatsAppInstituteShareMessage,
} from "@/lib/kene/whatsapp-relay";
import { useKene, isSavedUser } from "@/store/kene";
import { SectionTitle } from "./bits";
import { CauriIcon } from "@/components/kene/icons";
import { cn } from "@/lib/utils";
import { LinkAccountModal } from "./LinkAccountModal";

export interface InstituteShare {
  tenantId: string;
  name: string;
  city: string;
  active: boolean;
  hasPhoto: boolean;
  granted: boolean;
  visitsCount: number;
  lastVisit: string | null;
  phone?: string | null;
  ownerPhone?: string | null;
  country?: string | null;
}

type SharesData = { scansTotal: number; shares: InstituteShare[] };

export function SharesCard({ userId, userName }: { userId: string; userName: string }) {
  const [data, setData] = useState<SharesData | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCity, setSelectedCity] = useState<string>("all");
  const [linkModalOpen, setLinkModalOpen] = useState(false);

  const user = useKene((s) => s.user);
  const setUser = useKene((s) => s.setUser);

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

  // Villes uniques disponibles
  const cities = useMemo(() => {
    if (!data?.shares) return [];
    const set = new Set<string>();
    data.shares.forEach((s) => {
      const c = (s.city || "").trim();
      if (c) set.add(c);
    });
    return Array.from(set);
  }, [data?.shares]);

  // Instituts filtrés par recherche et ville
  const filteredShares = useMemo(() => {
    if (!data?.shares) return [];
    return data.shares.filter((s) => {
      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.city.toLowerCase().includes(q);
      const matchCity =
        selectedCity === "all" ||
        s.city.toLowerCase().includes(selectedCity.toLowerCase());
      return matchQuery && matchCity;
    });
  }, [data?.shares, searchQuery, selectedCity]);

  // Cocher ou décocher l'institut comme institut référent de la cliente
  const handleSelectReferenceInstitute = async (share: InstituteShare) => {
    if (!user) return;
    if (!isSavedUser(user)) {
      toast.error("Inscription requise", {
        description: "Vous devez être inscrite pour choisir votre institut partenaire et lui partager vos données.",
      });
      setLinkModalOpen(true);
      return;
    }

    const isAlreadySelected = user.selectedTenantId === share.tenantId;

    if (isAlreadySelected) {
      // Décocher l'institut référent
      setBusyId(share.tenantId);
      try {
        await apiPatch("/api/auth/profile", { userId: user.id, selectedTenantId: null });
        setUser({
          ...user,
          selectedTenantId: null,
          selectedTenant: null,
        });
        toast.success(`Institut ${share.name} décoché.`);
      } catch {
        toast.error("Erreur lors de la mise à jour");
      } finally {
        setBusyId(null);
      }
      return;
    }

    // Cocher le nouvel institut référent et persister en base
    setBusyId(share.tenantId);
    try {
      await apiPatch("/api/auth/profile", { userId: user.id, selectedTenantId: share.tenantId });
      setUser({
        ...user,
        selectedTenantId: share.tenantId,
        selectedTenant: {
          id: share.tenantId,
          name: share.name,
          city: share.city,
          phone: share.phone || share.ownerPhone,
          ownerPhone: share.ownerPhone,
          country: share.country,
        },
      });

      // Active automatiquement le consentement de partage si pas déjà accordé
      if (!share.granted) {
        void toggle(share, true);
      }

      toast.success(`Institut référent mis à jour : ${share.name} ✅`, {
        description: "Vos prises de rendez-vous et soins sont désormais liés à cet établissement.",
      });
    } catch {
      toast.error("Impossible de sélectionner cet institut");
    } finally {
      setBusyId(null);
    }
  };

  // Bascule du consentement de partage des self-scans
  async function toggle(share: InstituteShare, next: boolean) {
    if (!isSavedUser(user)) {
      toast.error("Inscription requise", {
        description: "Un compte invité ne peut pas partager ses bilans avec un institut. Enregistrez votre compte pour activer le partage.",
      });
      setLinkModalOpen(true);
      return;
    }

    setBusyId(share.tenantId);
    try {
      await apiPost("/api/auth/shares", { userId, tenantId: share.tenantId, granted: next });
      setData((d) =>
        d
          ? {
              ...d,
              shares: d.shares.map((s) =>
                s.tenantId === share.tenantId ? { ...s, granted: next } : s
              ),
            }
          : d
      );

      // Si la cliente accorde le partage et n'a pas encore d'institut coché, on lie automatiquement celui-ci
      if (next && user && !user.selectedTenantId) {
        await apiPatch("/api/auth/profile", { userId: user.id, selectedTenantId: share.tenantId }).catch(() => null);
        setUser({
          ...user,
          selectedTenantId: share.tenantId,
          selectedTenant: {
            id: share.tenantId,
            name: share.name,
            city: share.city,
            phone: share.phone || share.ownerPhone,
            ownerPhone: share.ownerPhone,
            country: share.country,
          },
        });
      }

      toast.success(
        next
          ? `Diagnostics partagés avec ${share.name}`
          : `Partage retiré pour ${share.name}`,
        {
          description: next
            ? "L'équipe de l'institut a maintenant accès à votre profil pour adapter vos soins cabine."
            : "L'institut ne voit plus vos self-scans — effectif immédiatement.",
        }
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mise à jour impossible");
    } finally {
      setBusyId(null);
    }
  }

  // Partager le diagnostic & échanger avec l'institut par WhatsApp
  const handleShareOnWhatsApp = (share: InstituteShare) => {
    if (!isSavedUser(user)) {
      toast.error("Inscription requise", {
        description: "Vous devez être inscrite pour partager vos bilans et échanger avec cet institut.",
      });
      setLinkModalOpen(true);
      return;
    }

    const phone = share.phone || share.ownerPhone || "";
    const country = (share.country || "CI") as "CI" | "SN";
    const msg = `Bonjour ${share.name} ! 🌸\n\nJe suis cliente sur l'application Kènè (${userName}). J'ai choisi votre établissement comme institut partenaire référent et j'aimerais vous partager mon bilan cutané pour mes soins.\n\nÀ très vite ! 🌿`;
    openWhatsApp(phone, msg, country);
  };

  // Recommander l'institut à une amie sur WhatsApp
  const handleRecommendOnWhatsApp = (share: InstituteShare) => {
    const text = buildWhatsAppInstituteShareMessage(share);
    openWhatsApp("", text, (share.country || "CI") as "CI" | "SN");
  };

  const firstName = userName.trim().split(/\s+/)[0] ?? userName;

  return (
    <section id="kene-shares-section" aria-labelledby="sh-t" className="space-y-3">
      <SectionTitle icon={<Share2 size={16} />}>
        <span id="sh-t">Partager avec mes instituts</span>
      </SectionTitle>

      <div className="k-card rounded-[26px] p-4 sm:p-5 shadow-xs space-y-4">
        {/* En-tête explicatif */}
        <div>
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-heading font-black text-sm sm:text-base text-foreground">
              Vos bilans cutanés, votre décision
            </h3>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gold/15 text-gold-text">
              RGPD &amp; Confidentialité
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            Cochez l&apos;institut de votre choix pour lier vos soins et autorisez l&apos;accès à vos diagnostics ({data?.scansTotal ?? "…"} scans). Vous gardez le contrôle total à tout moment.
          </p>
        </div>

        {/* Bannière de protection des données pour compte invité */}
        {user && !isSavedUser(user) && (
          <div className="rounded-2xl border-2 border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-gold/10 to-transparent p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="grid place-items-center size-9 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0 font-bold">
                🔒
              </span>
              <div>
                <p className="font-heading font-black text-xs text-foreground">
                  Mode Invité : Données Cutanées Strictement Privées
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Vos bilans restent confidentiels sur cet appareil. Créez votre compte pour autoriser le partage avec un institut partenaire.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLinkModalOpen(true)}
              className="shrink-0 h-9 px-3.5 rounded-xl k-btn-gold text-primary-foreground font-bold text-xs shadow-xs active:scale-95 transition-all"
            >
              Créer mon compte
            </button>
          </div>
        )}

        {/* ───── Encart Institut Référent Actuellement Coché ───── */}
        {user?.selectedTenant && (() => {
          const activeShare = data?.shares.find((s) => s.tenantId === user.selectedTenant?.id);
          const isSharingScans = activeShare?.granted ?? false;

          return (
            <div className="rounded-2xl border-2 border-primary/40 bg-gradient-to-r from-primary/10 via-card to-primary/5 p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3 min-w-0">
                <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shrink-0 shadow-xs">
                  <CauriIcon size={18} />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black uppercase tracking-wider text-primary">
                      Mon Institut Référent Coché ✅
                    </span>
                    {isSharingScans ? (
                      <span className="text-[9.5px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Check size={10} /> Bilans partagés
                      </span>
                    ) : (
                      <span className="text-[9.5px] font-bold text-amber-700 dark:text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Lock size={9} /> Partage désactivé (Privé)
                      </span>
                    )}
                  </div>
                  <p className="font-heading font-black text-sm text-foreground truncate mt-0.5">
                    {user.selectedTenant.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <MapPin size={11} className="text-primary" /> {user.selectedTenant.city}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => {
                    const share = data?.shares.find((s) => s.tenantId === user.selectedTenant?.id);
                    if (share) {
                      void handleSelectReferenceInstitute(share);
                    } else if (user.selectedTenant) {
                      // Fallback si l'institut n'est pas dans la liste courante
                      void handleSelectReferenceInstitute({
                        tenantId: user.selectedTenant.id,
                        name: user.selectedTenant.name,
                        city: user.selectedTenant.city,
                        active: true,
                        hasPhoto: false,
                        granted: false,
                        visitsCount: 0,
                        lastVisit: null,
                      });
                    }
                  }}
                  className="h-8 px-2.5 rounded-xl border border-border bg-card/80 hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-semibold flex items-center gap-1 shadow-2xs transition-colors"
                  title="Décocher cet institut référent"
                >
                  Décocher
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const phone = user.selectedTenant?.phone || (user.selectedTenant as any)?.ownerPhone || "";
                    const country = ((user.selectedTenant as any)?.country || "CI") as "CI" | "SN";
                    openWhatsApp(
                      phone,
                      `Bonjour ${user.selectedTenant?.name} ! 🌸\nJe suis cliente Kènè (${userName}). Je vous partage mon bilan cutané pour mon prochain soin.`,
                      country
                    );
                  }}
                  className="h-8 px-3 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-transform active:scale-95"
                >
                  <MessageCircle size={13} />
                  Partager (WhatsApp)
                </button>
              </div>
            </div>
          );
        })()}

        {/* ───── Barre de Recherche & Filtres Rapides ───── */}
        <div className="space-y-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un institut, quartier (Cocody, Plateau, Dakar...)"
              className="k-input h-10 w-full rounded-xl pl-9 pr-3 text-xs focus-visible:outline-2 focus-visible:outline-primary"
            />
          </div>

          {cities.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pretty-scroll pb-1">
              <button
                type="button"
                onClick={() => setSelectedCity("all")}
                className={cn(
                  "shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all",
                  selectedCity === "all"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                Toutes les villes ({data?.shares?.length ?? 0})
              </button>
              {cities.map((city) => (
                <button
                  key={city}
                  type="button"
                  onClick={() => setSelectedCity(city)}
                  className={cn(
                    "shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all",
                    selectedCity === city
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  📍 {city}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ───── Liste des Établissements ───── */}
        <div className="space-y-2.5">
          {!data && !failed && (
            <>
              <Skeleton className="h-20 rounded-2xl" />
              <Skeleton className="h-20 rounded-2xl" />
              <Skeleton className="h-20 rounded-2xl" />
            </>
          )}

          {failed && (
            <p className="rounded-2xl bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
              Liste indisponible pour le moment — tirez pour rafraîchir.
            </p>
          )}

          {data && filteredShares.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground space-y-1">
              <p>Aucun institut trouvé pour cette recherche.</p>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedCity("all");
                  }}
                  className="text-primary font-bold hover:underline text-xs"
                >
                  Réinitialiser les filtres
                </button>
              )}
            </div>
          )}

          {filteredShares.map((s) => {
            const isSelected = user?.selectedTenantId === s.tenantId;

            return (
              <div
                key={s.tenantId}
                className={cn(
                  "flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border p-3.5 transition-all",
                  isSelected
                    ? "border-primary/50 bg-primary/5 shadow-xs"
                    : "border-border/80 bg-card/60 hover:bg-card/90"
                )}
              >
                {/* Infos Institut */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span
                    className={cn(
                      "grid size-11 shrink-0 place-items-center rounded-xl",
                      isSelected ? "bg-primary text-primary-foreground shadow-xs" : "bg-gold/15 text-gold-text"
                    )}
                  >
                    <Building2 size={20} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="truncate text-sm font-heading font-black text-foreground">{s.name}</p>
                      {isSelected && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/20 text-primary px-2 py-0.5 text-[9.5px] font-bold">
                          <Check size={10} /> Référent
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      <span>📍 {s.city}</span>
                      {s.lastVisit && (
                        <span>· visite le {formatDate(s.lastVisit, { day: "numeric", month: "short" })}</span>
                      )}
                      <span>·</span>
                      {s.granted ? (
                        <span className="inline-flex items-center gap-0.5 font-bold text-emerald-600 dark:text-emerald-400">
                          <Check size={11} /> Diagnostics partagés
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-muted-foreground font-medium">
                          <Lock size={10} /> Privé
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Actions & Consentement */}
                <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                  {/* Bouton Mon Institut Référent & Partage unifié */}
                  <button
                    type="button"
                    onClick={() => {
                      if (!isSelected) {
                        handleSelectReferenceInstitute(s);
                      }
                      if (!s.granted) {
                        toggle(s, true);
                      }
                    }}
                    className={cn(
                      "h-8 px-3 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
                      isSelected
                        ? "bg-primary/20 text-primary border border-primary/40 ring-1 ring-primary/30"
                        : "bg-muted/70 hover:bg-muted text-foreground border border-border"
                    )}
                    title={isSelected ? "Mon institut référent" : "Définir comme mon institut référent"}
                  >
                    <CheckCircle2 size={13} className={isSelected ? "text-primary" : "text-muted-foreground"} />
                    <span>{isSelected ? "Mon Institut" : "Choisir"}</span>
                  </button>

                  {/* Bouton Partager mon diagnostic sur WhatsApp */}
                  <button
                    type="button"
                    onClick={() => handleShareOnWhatsApp(s)}
                    title={`Partager mon bilan avec ${s.name} sur WhatsApp`}
                    className="size-8 rounded-xl bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#128C7E] dark:text-[#25D366] grid place-items-center transition-colors cursor-pointer"
                  >
                    <MessageCircle size={15} />
                  </button>

                  {/* Bouton Rendez-vous cabine */}
                  <button
                    type="button"
                    onClick={() =>
                      openWhatsAppAppointmentInquiry({
                        serviceCategory: "Soin esthétique",
                        serviceName: "Soin cabine personnalisé",
                        instituteName: s.name,
                        tenantPhone: s.phone || s.ownerPhone || undefined,
                        country: (s.country || "CI") as "CI" | "SN",
                      })
                    }
                    title={`Prendre rendez-vous chez ${s.name}`}
                    className="size-8 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary grid place-items-center transition-colors cursor-pointer"
                  >
                    <CalendarPlus size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Note de traçabilité RGPD */}
        <p className="border-t border-dashed border-border pt-2.5 text-[10.5px] leading-relaxed text-muted-foreground">
          {firstName}, chaque accord de partage est conservé de façon sécurisée (RGPD / loi ivoirienne n°2013-450). L&apos;institut de votre choix peut consulter l&apos;évolution de votre score santé pour adapter vos rituels et soins cabine. Vous pouvez révoquer l&apos;accès à tout moment en 1 clic.
        </p>
      </div>

      {/* Modal d'inscription et enregistrement du compte client invité */}
      <LinkAccountModal
        open={linkModalOpen}
        onClose={() => setLinkModalOpen(false)}
        reason="Créez votre compte pour relier votre suivi de peau et vos bilans à un institut partenaire."
      />
    </section>
  );
}
