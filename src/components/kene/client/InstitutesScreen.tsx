"use client";
// Kènè Cliente — Écran des Instituts Partenaires
// Permet à la cliente de voir toutes les entreprises qui ont créé leur compte,
// de cocher l'institut qui lui correspond (qui recevra ses bilans dermo-cosmétiques),
// et d'échanger directement sur WhatsApp.

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  Heart,
  Loader2,
  MapPin,
  MessageCircle,
  Search,
  Share2,
  Sparkles,
  Star,
  Store,
  CalendarPlus,
} from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPatch } from "@/lib/kene/api";
import { openWhatsApp, buildWhatsAppInstituteShareMessage, openWhatsAppAppointmentInquiry } from "@/lib/kene/whatsapp-relay";
import { useKene, isSavedUser } from "@/store/kene";
import { SankofaIcon, CauriIcon, KeneEmblem } from "@/components/kene/icons";
import { cn } from "@/lib/utils";
import type { ApiInstitute } from "./types";
import { LinkAccountModal } from "./LinkAccountModal";

export function InstitutesScreen() {
  const user = useKene((s) => s.user)!;
  const setUser = useKene((s) => s.setUser);

  const [institutes, setInstitutes] = useState<ApiInstitute[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);

  // ID de l'institut coché par la cliente
  const selectedTenantId = user.selectedTenantId || null;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await apiGet<{ institutes: ApiInstitute[] }>("/api/institutes");
        if (alive) {
          setInstitutes(res.institutes ?? []);
          setLoading(false);
        }
      } catch (e) {
        if (alive) {
          toast.error("Impossible de charger les instituts partenaires");
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Villes disponibles parmi les instituts enregistrés
  const availableCities = useMemo(() => {
    const set = new Set<string>();
    institutes.forEach((i) => {
      if (i.city) set.add(i.city.trim());
    });
    return Array.from(set);
  }, [institutes]);

  // Filtrage des instituts
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return institutes.filter((inst) => {
      const matchCity =
        cityFilter === "all" || inst.city.toLowerCase() === cityFilter.toLowerCase();
      const matchSearch =
        !q ||
        inst.name.toLowerCase().includes(q) ||
        inst.city.toLowerCase().includes(q) ||
        (inst.address && inst.address.toLowerCase().includes(q)) ||
        (inst.description && inst.description.toLowerCase().includes(q));
      return matchCity && matchSearch;
    });
  }, [institutes, search, cityFilter]);

  // Institut actuellement sélectionné
  const currentSelectedInst = useMemo(() => {
    if (!selectedTenantId) return null;
    return institutes.find((i) => i.id === selectedTenantId) ?? null;
  }, [institutes, selectedTenantId]);

  // Action de coche / sélection de l'institut
  async function handleToggleSelect(inst: ApiInstitute) {
    if (!isSavedUser(user)) {
      toast.error("Inscription requise", {
        description: "Vous devez être inscrite pour choisir votre institut partenaire et lui partager votre profil.",
      });
      setLinkModalOpen(true);
      return;
    }

    const isAlreadySelected = selectedTenantId === inst.id;
    const nextTenantId = isAlreadySelected ? null : inst.id;
    const nextSelectedTenant = nextTenantId
      ? {
          id: inst.id,
          name: inst.name,
          city: inst.city,
          phone: inst.phone || inst.ownerPhone,
          ownerPhone: inst.ownerPhone,
          address: inst.address,
          country: inst.country,
        }
      : null;

    setSavingId(inst.id);
    try {
      const res = await apiPatch<{ user: typeof user }>("/api/auth/profile", {
        userId: user.id,
        selectedTenantId: nextTenantId,
      });

      setUser({
        ...user,
        ...(res.user || {}),
        selectedTenantId: nextTenantId,
        selectedTenant: nextTenantId ? ((res.user as any)?.selectedTenant || nextSelectedTenant) : null,
      });

      if (nextTenantId) {
        toast.success(`Institut partenaire coché ✨`, {
          description: `${inst.name} est désormais votre institut de référence. Vos prochains rendez-vous et soins WhatsApp lui seront directement liés.`,
        });
      } else {
        toast.info("Institut décoché", {
          description: "Vous pouvez choisir un autre institut partenaire à tout moment.",
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la sélection");
    } finally {
      setSavingId(null);
    }
  }

  // Échange WhatsApp direct
  function handleWhatsApp(inst: ApiInstitute) {
    if (!isSavedUser(user)) {
      toast.error("Inscription requise", {
        description: "Vous devez être inscrite pour échanger directement avec un institut partenaire.",
      });
      setLinkModalOpen(true);
      return;
    }
    const phone = inst.phone || inst.ownerPhone || "2250700000000";
    const msg = `Bonjour ${inst.name} ! 🌸\n\nJe suis cliente sur l'application Kènè (${user.name}). Je souhaite échanger avec vous pour mes rituels de soin dermo-cosmétiques.\n\nÀ très bientôt ! ✨`;
    openWhatsApp(phone, msg, inst.country === "SN" ? "SN" : "CI");
  }

  // Partage de l'institut via WhatsApp ou Web Share
  async function handleShareInstitute(inst: ApiInstitute) {
    const msg = buildWhatsAppInstituteShareMessage({
      name: inst.name,
      city: inst.city,
      address: inst.address,
      phone: inst.phone || inst.ownerPhone,
      description: inst.description,
    });

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: `${inst.name} · Institut Partenaire Kènè`,
          text: msg,
        });
        toast.success(`Institut partagé 🌸`, {
          description: `Merci de recommander ${inst.name} !`,
        });
        return;
      } catch (err: any) {
        if (err?.name === "AbortError") return;
      }
    }

    // Repli WhatsApp direct
    openWhatsApp("", msg, inst.country === "SN" ? "SN" : "CI");
    toast.success(`Partage WhatsApp ouvert 🌸`);
  }

  // Prise de rendez-vous directe avec cet institut
  function handleBookCareWithInstitute(inst: ApiInstitute) {
    if (!isSavedUser(user)) {
      toast.error("Inscription requise", {
        description: "Vous devez être inscrite pour réserver un soin cabine dans un institut.",
      });
      setLinkModalOpen(true);
      return;
    }
    openWhatsAppAppointmentInquiry({
      serviceCategory: "Soin esthétique",
      serviceName: "Soin signature cabine & éclat",
      instituteName: inst.name,
      tenantPhone: inst.phone || inst.ownerPhone || undefined,
      country: inst.country === "SN" ? "SN" : "CI",
    });
  }

  return (
    <div className="space-y-4 pb-2">
      {/* ───── En-tête de la section ───── */}
      <header className="space-y-1">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-[11px] font-semibold text-primary">
          <Building2 size={13} />
          <span>Instituts &amp; Salons</span>
        </div>
        <h2 className="font-heading font-black text-xl sm:text-2xl text-foreground tracking-tight">
          Choisis ton Institut Référent
        </h2>
        <p className="text-xs text-muted-foreground">
          Coche ton institut habituel : il recevra tes bilans de peau et tes alertes.
        </p>
      </header>

      {/* ───── Carte VIP de l'institut coché actuel ───── */}
      {currentSelectedInst && (
        <section
          aria-label="Mon institut sélectionné"
          className="rounded-[24px] border-2 border-primary/60 bg-gradient-to-br from-primary/15 via-card to-gold/10 p-4 shadow-sm relative overflow-hidden"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground font-black shrink-0 shadow-md">
                <CheckCircle2 size={22} />
              </span>
              <div className="min-w-0">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-primary flex items-center gap-1">
                  <Sparkles size={11} /> Mon Institut Référent
                </span>
                <h3 className="font-heading font-black text-base sm:text-lg text-foreground truncate">
                  {currentSelectedInst.name}
                </h3>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <MapPin size={12} className="text-primary shrink-0" />
                  <span>{currentSelectedInst.address ? `${currentSelectedInst.address}, ` : ""}{currentSelectedInst.city}</span>
                </p>
              </div>
            </div>

            <button
              onClick={() => handleToggleSelect(currentSelectedInst)}
              disabled={savingId === currentSelectedInst.id}
              className="text-xs text-muted-foreground hover:text-foreground font-semibold underline underline-offset-4 shrink-0 transition-colors"
            >
              Changer
            </button>
          </div>

          <div className="mt-3 pt-3 border-t border-primary/20 flex flex-wrap items-center justify-between gap-2.5">
            <p className="text-xs text-muted-foreground truncate">
              Reçoit automatiquement tes diagnostics &amp; tes rendez-vous.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleShareInstitute(currentSelectedInst)}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-bold transition-all"
                title="Partager cet institut sur WhatsApp"
              >
                <Share2 size={13} />
                <span>Partager</span>
              </button>
              <button
                onClick={() => handleBookCareWithInstitute(currentSelectedInst)}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-xs active:scale-95 transition-all"
                title="Prendre rendez-vous"
              >
                <CalendarPlus size={13} />
                <span>Prendre RDV</span>
              </button>
              <button
                onClick={() => handleWhatsApp(currentSelectedInst)}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-white text-xs font-bold shadow-xs active:scale-95 transition-all"
                title="Échanger sur WhatsApp"
              >
                <MessageCircle size={14} />
                <span>WhatsApp</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ───── Recherche & Filtres de localisation ───── */}
      <div className="rounded-[22px] border border-border/80 bg-card/80 backdrop-blur-xs p-3.5 space-y-3 shadow-xs">
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom d'institut, quartier (Cocody, Plateau, Almadies)…"
            className="w-full h-11 pl-10 pr-4 rounded-xl bg-muted/40 border border-border text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
          />
        </div>

        {/* Boutons filtres par ville */}
        {availableCities.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
            <button
              onClick={() => setCityFilter("all")}
              className={cn(
                "h-8 px-3 rounded-full text-xs font-semibold whitespace-nowrap transition-colors",
                cityFilter === "all"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              Toutes les villes ({institutes.length})
            </button>
            {availableCities.map((city) => (
              <button
                key={city}
                onClick={() => setCityFilter(city)}
                className={cn(
                  "h-8 px-3 rounded-full text-xs font-semibold whitespace-nowrap transition-colors capitalize",
                  cityFilter.toLowerCase() === city.toLowerCase()
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                {city}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ───── Liste des Instituts Enregistrés ───── */}
      {loading ? (
        <div className="py-16 text-center space-y-3">
          <Loader2 size={24} className="animate-spin text-primary mx-auto" />
          <p className="text-xs text-muted-foreground">Chargement des instituts partenaires…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center space-y-2">
          <Building2 size={28} className="text-muted-foreground mx-auto" />
          <p className="font-heading font-bold text-sm text-foreground">Aucun institut trouvé</p>
          <p className="text-xs text-muted-foreground">
            Essayez de modifier votre recherche ou de réinitialiser le filtre de ville.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((inst) => {
            const isSelected = selectedTenantId === inst.id;
            const isSaving = savingId === inst.id;

            return (
              <article
                key={inst.id}
                className={cn(
                  "rounded-[24px] border transition-all duration-200 overflow-hidden flex flex-col justify-between p-4.5 bg-card/90 backdrop-blur-xs shadow-xs",
                  isSelected
                    ? "border-primary ring-2 ring-primary/30 bg-gradient-to-br from-primary/10 via-card to-card"
                    : "border-border/80 hover:border-border hover:shadow-sm"
                )}
              >
                {/* En-tête de la carte */}
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {inst.image ? (
                        <img
                          src={inst.image}
                          alt={inst.name}
                          className="size-13 rounded-2xl object-cover shrink-0 border border-border/80 shadow-xs"
                        />
                      ) : (
                        <span className="grid size-13 place-items-center rounded-2xl bg-primary/10 text-primary shrink-0 border border-primary/20">
                          <SankofaIcon size={22} />
                        </span>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-heading font-black text-sm sm:text-base text-foreground truncate">
                            {inst.name}
                          </h3>
                        </div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                          <MapPin size={12} className="text-primary shrink-0" />
                          <span>{inst.address ? `${inst.address}, ` : ""}{inst.city}</span>
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1">
                          <span className="inline-flex items-center gap-0.5 font-bold text-amber-500">
                            <Star size={11} className="fill-amber-500" />
                            {inst.rating ? inst.rating.toFixed(1) : "4.8"}
                          </span>
                          <span>·</span>
                          <span>{inst.reviewCount ?? 0} avis</span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1 font-mono">
                            <Clock size={11} /> {inst.openingHour || 9}h - {inst.closingHour || 19}h
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Description de l'établissement */}
                  {inst.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed pl-1">
                      {inst.description}
                    </p>
                  )}
                </div>

                {/* ───── Coche & Actions en bas de carte ───── */}
                <div className="mt-4 pt-3 border-t border-border/60 flex flex-wrap items-center justify-between gap-2">
                  {/* Case à cocher : Mon Institut Partenaire */}
                  <button
                    type="button"
                    onClick={() => handleToggleSelect(inst)}
                    disabled={isSaving}
                    aria-checked={isSelected}
                    role="checkbox"
                    className={cn(
                      "inline-flex items-center gap-2 h-9 px-3 rounded-xl text-xs font-bold transition-all focus-visible:outline-2 focus-visible:outline-primary",
                      isSelected
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "border border-border bg-muted/30 hover:bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {isSaving ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : isSelected ? (
                      <Check size={14} className="stroke-[3]" />
                    ) : (
                      <span className="size-3.5 rounded-sm border border-muted-foreground/60" />
                    )}
                    <span>{isSelected ? "Mon institut coché ✅" : "Cocher cet institut"}</span>
                  </button>

                  <div className="flex items-center gap-1.5 ml-auto">
                    {/* Bouton Partager */}
                    <button
                      type="button"
                      onClick={() => handleShareInstitute(inst)}
                      title={`Partager ${inst.name}`}
                      className="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-xl border border-border bg-card/60 hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-bold transition-colors"
                    >
                      <Share2 size={13} />
                      <span className="hidden sm:inline">Partager</span>
                    </button>

                    {/* Bouton RDV direct */}
                    <button
                      type="button"
                      onClick={() => handleBookCareWithInstitute(inst)}
                      title={`Prendre RDV chez ${inst.name}`}
                      className="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-bold transition-colors"
                    >
                      <CalendarPlus size={13} />
                      <span>RDV</span>
                    </button>

                    {/* Bouton WhatsApp direct avec l'institut */}
                    <button
                      type="button"
                      onClick={() => handleWhatsApp(inst)}
                      title={`Échanger sur WhatsApp avec ${inst.name}`}
                      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#128C7E] dark:text-[#25D366] border border-[#25D366]/30 text-xs font-bold transition-colors"
                    >
                      <MessageCircle size={14} />
                      <span>WhatsApp</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Modal d'inscription / enregistrement du compte pour cliente invitée */}
      <LinkAccountModal
        open={linkModalOpen}
        onClose={() => setLinkModalOpen(false)}
        reason="Créez votre compte pour relier votre suivi de peau et vos bilans à un institut partenaire."
      />
    </div>
  );
}
