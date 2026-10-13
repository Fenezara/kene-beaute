"use client";
// Kènè — Conciergerie Privée WhatsApp (Assistance VIP & Secrétariat 24/7) :
// • Espace dédié pour toutes les demandes WhatsApp de la cliente :
//   1. 💆‍♀️ Réservation de soins & rendez-vous prioritaires
//   2. 🌿 Réapprovisionnement de l'ordonnance beauté express
//   3. 🔬 SOS Peau & Dermo-Conseil d'urgence avec photo
//   4. 🚚 Suivi de livraison, paiements Mobile Money & factures
//   5. 🎁 Bons cadeaux, forfaits mariage & privilèges anniversaire
// • Raccordement intelligent avec l'institut partenaire sélectionné (ou Kènè Central).

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Crown,
  MessageCircle,
  Calendar,
  Sparkles,
  ShoppingBag,
  ShieldCheck,
  Truck,
  Heart,
  Clock,
  MapPin,
  ChevronRight,
  PhoneCall,
  Send,
  User,
  CheckCircle2,
  AlertCircle,
  Gift,
  Building2,
  Scissors,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useKene, type ClientTab } from "@/store/kene";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import { openWhatsApp, KENE_SUPPORT_PHONE, getClientSelectedInstitute } from "@/lib/kene/whatsapp-relay";
import type { ApiInstitute } from "./types";

type ConciergeCategory = "rdv" | "commande" | "sos_peau" | "suivi" | "cadeau";

interface Props {
  selectedInstitute?: ApiInstitute | { id: string; name: string; city: string; phone?: string | null; ownerPhone?: string | null; country?: string | null } | null;
  onNavigateTab?: (tab: ClientTab) => void;
}

export function ConciergerieWhatsAppSection({ selectedInstitute, onNavigateTab }: Props) {
  const user = useKene((s) => s.user)!;
  const chosenInstitute = selectedInstitute || getClientSelectedInstitute();

  const [category, setCategory] = useState<ConciergeCategory>("rdv");

  // Options RDV
  const [careType, setCareType] = useState("Soin du visage dermo-cosmétique");
  const [preferredDay, setPreferredDay] = useState("Dès que possible");
  const [preferredTime, setPreferredTime] = useState("Après-midi (14h - 18h)");

  // Options Commande
  const [orderType, setOrderType] = useState("Mon ordonnance beauté complète");
  const [deliveryCity, setDeliveryCity] = useState(user.city || "Abidjan");

  // Options SOS Peau
  const [sosReason, setSosReason] = useState("Poussée de boutons ou réaction cutanée");

  // Consigne / Note libre
  const [customNote, setCustomNote] = useState("");

  // Numéro WhatsApp cible : Institut partenaire coché > Numéro officiel Kènè
  const targetPhone = chosenInstitute?.phone || (chosenInstitute as any)?.ownerPhone || KENE_SUPPORT_PHONE;
  const targetName = chosenInstitute?.name || "Conciergerie Officielle Kènè";

  // Construction du message WhatsApp VIP
  const buildWhatsAppMessage = () => {
    const greeting = `Bonjour l'équipe de *${targetName}* ! 🌿✨\nJe suis *${user.name}* (tel: ${user.phone}).`;
    const fitzInfo = user.fitzpatrick ? `\n• Mon profil : Fitzpatrick ${user.fitzpatrick} (peau mélanoderme)` : "";

    let body = "";

    switch (category) {
      case "rdv":
        body = `\n\n📅 *DEMANDE DE RENDEZ-VOUS VIP*\n• Soin souhaité : ${careType}\n• Date souhaitée : ${preferredDay}\n• Créneau horaire : ${preferredTime}`;
        break;
      case "commande":
        body = `\n\n📦 *COMMANDE & ORDONNANCE BEAUTÉ*\n• Produits demandés : ${orderType}\n• Ville de livraison : ${deliveryCity}\n• Mode souhaité : Livraison express par coursier`;
        break;
      case "sos_peau":
        body = `\n\n🔬 *SOS PEAU & CONSEIL EN DIRECT*\n• Motif : ${sosReason}\n• Je souhaite vous envoyer une photo pour analyse et obtenir votre recommandation.`;
        break;
      case "suivi":
        body = `\n\n🚚 *SUIVI DE COMMANDE & PAIEMENT*\n• Je souhaite avoir des informations sur ma commande / livraison en cours ou mon paiement.`;
        break;
      case "cadeau":
        body = `\n\n🎁 *PRIVILÈGE VIP & BON CADEAU*\n• Je souhaite offrir une expérience soin Kènè ou profiter de mes avantages VIP.`;
        break;
    }

    const note = customNote.trim() ? `\n\n📝 *Précision :* ${customNote.trim()}` : "";
    const footer = `\n\n_Transmis via la Conciergerie Privée Kènè_ 🌸`;

    return `${greeting}${fitzInfo}${body}${note}${footer}`;
  };

  const handleSendWhatsApp = () => {
    haptic(HAPTIC.tap);
    const msg = buildWhatsAppMessage();
    openWhatsApp(targetPhone, msg);
    toast.success("Ouverture de WhatsApp avec votre Concierge", {
      description: `Demande transmise à ${targetName}`,
    });
  };

  return (
    <div className="space-y-5 pb-6">
      {/* ───── En-tête Prestige Conciergerie ───── */}
      <div className="relative overflow-hidden rounded-[26px] border border-[#C8951E]/40 bg-gradient-to-br from-[#1C1611] via-[#241A14] to-[#18130E] p-5 text-[#FFF9EC] shadow-xl">
        <div aria-hidden="true" className="absolute -right-8 -top-8 size-40 rounded-full bg-[#C8951E]/15 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#C8951E]/20 border border-[#C8951E]/40 px-3 py-0.5 text-[11px] font-black uppercase tracking-wider text-[#FFD875]">
              <Crown size={12} className="animate-pulse" />
              Conciergerie Privée WhatsApp 24/7
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              En ligne
            </span>
          </div>

          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className="font-heading font-black text-lg sm:text-xl text-[#FFF9EC]">
                Votre Secrétaire &amp; Conseiller Dédié
              </h2>
              <p className="text-xs text-[#EADCC9]/85 leading-relaxed">
                Rendez-vous prioritaires, réapprovisionnement express d&apos;ordonnance beauté, SOS peau et assistance sur-mesure en direct avec votre institut.
              </p>
            </div>
            <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-[#C8951E] to-[#8B1A3B] text-white shrink-0 shadow-md">
              <MessageCircle size={24} />
            </span>
          </div>

          {/* Institut partenaire rattaché */}
          <div className="pt-2 border-t border-[#FFF9EC]/10 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <Building2 size={14} className="text-[#FFD875] shrink-0" />
              <span className="text-[#EADCC9]/90 truncate">
                Rattaché à : <strong className="text-[#FFF9EC]">{targetName}</strong>
              </span>
            </div>
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab("profil")}
                className="shrink-0 text-[11px] font-bold text-[#FFD875] hover:underline"
              >
                Changer d&apos;institut
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ───── Choix de la Demande (Boutons Thématiques) ───── */}
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
          Sélectionnez votre besoin VIP :
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            { id: "rdv", label: "Prendre un RDV Soin", icon: Calendar, badge: "Prioritaire" },
            { id: "commande", label: "Ordonnance Beauté", icon: ShoppingBag, badge: "Express" },
            { id: "sos_peau", label: "SOS Peau Direct", icon: Sparkles, badge: "Urgence" },
            { id: "suivi", label: "Suivi & Paiements", icon: Truck, badge: "Wave / OM" },
            { id: "cadeau", label: "Privilèges & Cadeaux", icon: Gift, badge: "VIP" },
          ].map((cat) => {
            const active = category === cat.id;
            const Icon = cat.icon;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  haptic(HAPTIC.light);
                  setCategory(cat.id as ConciergeCategory);
                }}
                className={cn(
                  "p-3 rounded-2xl border text-left transition-all flex flex-col justify-between gap-2 relative overflow-hidden",
                  active
                    ? "bg-primary/10 border-primary shadow-sm ring-1 ring-primary/40 text-foreground"
                    : "bg-card border-border/70 hover:bg-muted/50 text-muted-foreground"
                )}
              >
                <div className="flex items-center justify-between w-full">
                  <span
                    className={cn(
                      "grid size-8 rounded-xl place-items-center",
                      active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}
                  >
                    <Icon size={16} />
                  </span>
                  <span
                    className={cn(
                      "text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase",
                      active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {cat.badge}
                  </span>
                </div>
                <p className={cn("text-xs font-bold leading-tight", active ? "text-foreground" : "text-foreground/80")}>
                  {cat.label}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ───── Panneau de Configuration de la Demande ───── */}
      <Card className="border-border/80 bg-card rounded-2xl shadow-xs overflow-hidden">
        <CardContent className="p-4 sm:p-5 space-y-4">
          {/* Formulaire RDV */}
          {category === "rdv" && (
            <div className="space-y-3.5">
              <h4 className="font-heading font-bold text-sm flex items-center gap-2">
                <Calendar className="size-4 text-primary" />
                Détails du Rendez-Vous en Institut
              </h4>

              <div>
                <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">
                  Type de prestation :
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {[
                    "Soin du visage dermo-cosmétique",
                    "Bilan de peau & Diagnostic cabine",
                    "Massage relaxant & drainage",
                    "Coiffure & tresses protectrices",
                    "Onglerie & Manucure",
                  ].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setCareType(s)}
                      className={cn(
                        "px-3 py-2 rounded-xl text-xs font-medium text-left border transition-all",
                        careType === s
                          ? "bg-primary/15 border-primary text-primary font-bold shadow-xs"
                          : "bg-muted/40 border-border text-foreground/80 hover:bg-muted"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">
                    Jour souhaité :
                  </label>
                  <select
                    value={preferredDay}
                    onChange={(e) => setPreferredDay(e.target.value)}
                    className="k-input h-10 w-full rounded-xl px-3 text-xs"
                  >
                    <option value="Dès que possible">Dès que possible</option>
                    <option value="Aujourd'hui">Aujourd&apos;hui</option>
                    <option value="Demain">Demain</option>
                    <option value="Ce week-end">Ce week-end (Samedi / Dimanche)</option>
                    <option value="La semaine prochaine">La semaine prochaine</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">
                    Moment de la journée :
                  </label>
                  <select
                    value={preferredTime}
                    onChange={(e) => setPreferredTime(e.target.value)}
                    className="k-input h-10 w-full rounded-xl px-3 text-xs"
                  >
                    <option value="Matinée (9h - 12h)">Matinée (9h - 12h)</option>
                    <option value="Pause midi (12h - 14h)">Pause midi (12h - 14h)</option>
                    <option value="Après-midi (14h - 18h)">Après-midi (14h - 18h)</option>
                    <option value="Fin de journée (18h - 20h)">Fin de journée (18h - 20h)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Formulaire COMMANDE */}
          {category === "commande" && (
            <div className="space-y-3.5">
              <h4 className="font-heading font-bold text-sm flex items-center gap-2">
                <ShoppingBag className="size-4 text-primary" />
                Renouvellement Ordonnance Beauté &amp; Soins
              </h4>

              <div>
                <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">
                  Pack ou soin souhaité :
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {[
                    "Mon ordonnance beauté complète",
                    "Sérum éclat à l'Hibiscus & Moringa",
                    "Baume réparateur Karité brut",
                    "Infusion purifiante Kinkeliba",
                    "Huile de Balanites protectrice",
                  ].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setOrderType(p)}
                      className={cn(
                        "px-3 py-2 rounded-xl text-xs font-medium text-left border transition-all",
                        orderType === p
                          ? "bg-primary/15 border-primary text-primary font-bold shadow-xs"
                          : "bg-muted/40 border-border text-foreground/80 hover:bg-muted"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">
                  Ville de livraison par coursier :
                </label>
                <select
                  value={deliveryCity}
                  onChange={(e) => setDeliveryCity(e.target.value)}
                  className="k-input h-10 w-full rounded-xl px-3 text-xs"
                >
                  <option value="Abidjan">Abidjan (Cocody, Plateau, Marcory, Yopougon...)</option>
                  <option value="Dakar">Dakar (Plateau, Almadies, Mermoz, Maristes...)</option>
                  <option value="Retrait en institut">Retrait direct en institut</option>
                </select>
              </div>
            </div>
          )}

          {/* Formulaire SOS PEAU */}
          {category === "sos_peau" && (
            <div className="space-y-3.5">
              <h4 className="font-heading font-bold text-sm flex items-center gap-2">
                <Sparkles className="size-4 text-amber-500" />
                SOS Peau &amp; Conseil Dermo-Cosmétique d&apos;Urgence
              </h4>

              <div>
                <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">
                  Nature de votre urgence ou question cutanée :
                </label>
                <div className="space-y-1.5">
                  {[
                    "Poussée de boutons ou réaction cutanée",
                    "Picotements, rougeurs ou sécheresse intense",
                    "Taches sombres persistantes après un bouton",
                    "Question avant un événement (mariage, soirée)",
                  ].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSosReason(m)}
                      className={cn(
                        "w-full px-3 py-2 rounded-xl text-xs font-medium text-left border transition-all",
                        sosReason === m
                          ? "bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400 font-bold shadow-xs"
                          : "bg-muted/40 border-border text-foreground/80 hover:bg-muted"
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground bg-muted/30 p-2.5 rounded-xl border border-border/50">
                💡 <em>Astuce :</em> Vous pourrez joindre directement une photo en gros plan de la zone concernée dans la conversation WhatsApp qui va s&apos;ouvrir.
              </p>
            </div>
          )}

          {/* Formulaire SUIVI */}
          {category === "suivi" && (
            <div className="space-y-2">
              <h4 className="font-heading font-bold text-sm flex items-center gap-2">
                <Truck className="size-4 text-primary" />
                Suivi de Livraison &amp; Assistance Mobile Money
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Notre conciergerie vérifie immédiatement la position de votre coursier ou valide vos transactions Wave, Orange Money, Moov ou MTN.
              </p>
            </div>
          )}

          {/* Formulaire CADEAU */}
          {category === "cadeau" && (
            <div className="space-y-2">
              <h4 className="font-heading font-bold text-sm flex items-center gap-2">
                <Gift className="size-4 text-pink-500" />
                Cartes Cadeaux &amp; Privilèges VIP
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Offrez un protocole de soin sur-mesure à une proche ou débloquez vos avantages exclusifs pour votre mois d&apos;anniversaire.
              </p>
            </div>
          )}

          {/* Champ libre complémentaire */}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
              Précision ou consigne supplémentaire (optionnel) :
            </label>
            <Textarea
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="Ex : Je suis disponible à partir de 15h, ou je souhaite ajouter un baume à ma commande..."
              className="text-xs resize-none h-18 rounded-xl bg-background"
            />
          </div>

          {/* ───── Aperçu du message WhatsApp généré ───── */}
          <div className="rounded-xl border border-border/80 bg-muted/40 p-3.5 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <MessageCircle size={13} className="text-emerald-500" />
                Message WhatsApp généré
              </span>
              <span className="text-emerald-500 font-bold">Prêt pour envoi</span>
            </div>
            <p className="text-xs font-mono text-foreground/90 whitespace-pre-line bg-card/80 p-2.5 rounded-lg border border-border/50 max-h-32 overflow-y-auto pretty-scroll">
              {buildWhatsAppMessage()}
            </p>
          </div>

          {/* ───── Bouton Principal d'Envoi ───── */}
          <Button
            onClick={handleSendWhatsApp}
            className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm gap-2 shadow-lg active:scale-[0.98] transition-all"
          >
            <MessageCircle className="size-5" />
            <span>Ouvrir WhatsApp &amp; Envoyer ma Demande</span>
          </Button>
        </CardContent>
      </Card>

      {/* ───── Contact d'Urgence Téléphonique ───── */}
      <div className="p-4 rounded-2xl border border-border/70 bg-card flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary shrink-0">
            <PhoneCall size={18} />
          </span>
          <div>
            <p className="text-xs font-bold font-heading">Besoin d&apos;un échange vocal direct ?</p>
            <p className="text-[11px] text-muted-foreground">Ligne directe Conciergerie : {targetPhone}</p>
          </div>
        </div>
        <a
          href={`tel:${targetPhone.replace(/\s+/g, "")}`}
          className="shrink-0 h-9 px-3 rounded-xl border border-primary/30 text-primary font-bold text-xs flex items-center gap-1.5 hover:bg-primary/10 transition-colors"
        >
          <PhoneCall size={13} />
          <span>Appeler</span>
        </a>
      </div>
    </div>
  );
}
