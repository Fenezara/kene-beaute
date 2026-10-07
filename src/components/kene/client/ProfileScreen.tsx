"use client";
// Kènè Cliente — Profil: identité, profil peau rééditable, avantages, parrainage — ÉCLAT 2026.
// Les réglages (langue, notifications, sécurité, RGPD, PWA, espace entreprise,
// déconnexion) vivent désormais dans SettingsScreen — lien discret
// en pied d'écran vers l'onglet « parametres ».
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Baby, BadgeCheck, Calendar, Camera, Check, Coins, Gift, Heart, Loader2, MapPin,
  MessageCircle, Pencil, Phone, Plus, Settings, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { openWhatsApp } from "@/lib/kene/whatsapp-relay";
import { apiGet, apiPatch, apiPost, resizeImage } from "@/lib/kene/api";
import { formatDate, xof } from "@/lib/kene/format";
import { useT } from "@/lib/kene/use-t";
import type { GoldThreads } from "@/lib/kene/gold-threads";
import { KenteIdentity } from "@/components/kene/loom/KenteIdentity";
import { Reveal, RevealItem, Shimmer } from "@/components/kene/ui2026";
import { CauriIcon, KenteIcon, SankofaIcon } from "@/components/kene/icons";
import { useKene, type SessionUser } from "@/store/kene";
import type { ApiUser } from "./types";
import { FITZPATRICK_CARDS, SKIN_GOALS, SKIN_TYPES, diagImgSrc } from "./types";
import { SectionTitle } from "./bits";
import { ParrainageCard } from "./ParrainageCard";
import { PassportCard } from "./PassportCard";
import { SharesCard } from "./SharesCard";
import { BeforeAfterSlider } from "@/components/kene/evolution/BeforeAfterSlider";
import { cn } from "@/lib/utils";

/** SessionUser + goals (string JSON) renvoyé par PATCH profile */
type ClientUser = SessionUser & { goals?: string | null };


export function ProfileScreen() {
  const user = useKene((s) => s.user) as ClientUser | null;
  const setUser = useKene((s) => s.setUser);
  const setClientTab = useKene((s) => s.setClientTab);
  const { t } = useT();

  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [city, setCity] = useState(user?.city ?? "");
  const [district, setDistrict] = useState(user?.district ?? "");
  const [birthDate, setBirthDate] = useState(user?.birthDate ?? "");
  const [pregnant, setPregnant] = useState(Boolean(user?.pregnant));
  const [preferredChannel, setPreferredChannel] = useState(user?.preferredChannel ?? "whatsapp");
  const [beautyBudget, setBeautyBudget] = useState(user?.beautyBudget ?? "15-35k");
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [savingId, setSavingId] = useState(false);

  // Sync state if user prop changes
  useEffect(() => {
    if (user) {
      setName(user.name ?? "");
      setCity(user.city ?? "");
      setDistrict(user.district ?? "");
      setBirthDate(user.birthDate ?? "");
      setPregnant(Boolean(user.pregnant));
      setPreferredChannel(user.preferredChannel ?? "whatsapp");
      setBeautyBudget(user.beautyBudget ?? "15-35k");
    }
  }, [user]);

  // — photo de profil: aperçu local immédiat (data URL) + upload.
  // `hasAvatar` suit le store: la photo vit en base, servie par
  // /api/media/user/:id — jamais dans le state permanent.
  const [hasAvatar, setHasAvatar] = useState(Boolean(user?.hasAvatar));
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [userDiagnoses, setUserDiagnoses] = useState<any[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    apiGet<{ diagnoses: any[] }>(`/api/diagnoses?userId=${user.id}`)
      .then((res) => {
        setUserDiagnoses(res.diagnoses ?? []);
      })
      .catch(() => {});
  }, [user?.id]);

  async function onPickAvatar(file: File | undefined) {
    if (!file || !user?.id) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Photo trop lourde — choisis une image plus légère");
      return;
    }
    setAvatarBusy(true);
    try {
      // Redimensionnement local (canvas → JPEG ~820px): upload léger même en 3G
      const dataUrl = await resizeImage(file);
      setAvatarPreview(dataUrl);
      await apiPatch("/api/auth/profile", { userId: user.id, avatarData: dataUrl });
      setHasAvatar(true);
      setUser({ ...user, hasAvatar: true } as SessionUser);
      toast.success("Photo de profil mise à jour");
    } catch (e) {
      setAvatarPreview(null);
      toast.error(e instanceof Error ? e.message : "Photo impossible");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatar() {
    if (!user?.id) return;
    setAvatarBusy(true);
    try {
      await apiPatch("/api/auth/profile", { userId: user.id, avatarData: null });
      setHasAvatar(false);
      setAvatarPreview(null);
      setUser({ ...user, hasAvatar: false } as SessionUser);
      toast.success("Photo retirée");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Suppression impossible");
    } finally {
      setAvatarBusy(false);
    }
  }

  const avatarSrc = avatarPreview ?? (hasAvatar && user?.id ? `/api/media/user/${user.id}` : null);

  const [fitz, setFitz] = useState(user?.fitzpatrick ?? "V");
  const [skinType, setSkinType] = useState(user?.skinType ?? "mixte");
  const [allergies, setAllergies] = useState(user?.allergies ?? "");
  const [goals, setGoals] = useState<string[]>(() => {
    try {
      const parsed = JSON.parse(user?.goals ?? "[]");
      if (Array.isArray(parsed)) {
        return parsed.map((g: any) => (typeof g === "object" && g ? g.id : String(g)));
      }
      return [];
    } catch {
      return [];
    }
  });
  const [savingSkin, setSavingSkin] = useState(false);

  const [gold, setGold] = useState<GoldThreads | null>(null);

  // Fils d'Or — non bloquant: la section s'efface si indisponible.
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    apiGet<GoldThreads>(`/api/gold-threads?userId=${user.id}`)
      .then((g) => { if (alive) setGold(g); })
      .catch(() => {});
    return () => { alive = false; };
  }, [user?.id]);

  async function saveIdentity() {
    if (!user) return;
    setSavingId(true);
    try {
      const r = await apiPatch<{ user: ApiUser }>("/api/auth/profile", {
        userId: user.id,
        name: name.trim() || undefined,
        city: city.trim() || undefined,
        district: district.trim() || undefined,
      });
      setUser({ ...user, ...r.user } as SessionUser);
      setEdit(false);
      toast.success("Profil mis à jour");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mise à jour impossible");
    } finally {
      setSavingId(false);
    }
  }

  async function savePreferences() {
    if (!user) return;
    setSavingPrefs(true);
    try {
      const r = await apiPatch<{ user: ApiUser }>("/api/auth/profile", {
        userId: user.id,
        district: district.trim() || null,
        birthDate: birthDate.trim() || null,
        pregnant,
        preferredChannel,
        beautyBudget: beautyBudget || null,
      });
      setUser({ ...user, ...r.user } as SessionUser);
      toast.success("Privilèges & préférences enregistrés", {
        description: "Tes instituts partenaires adapteront désormais tes soins et offres.",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setSavingPrefs(false);
    }
  }

  async function saveSkin() {
    if (!user) return;
    setSavingSkin(true);
    try {
      const r = await apiPatch<{ user: ApiUser }>("/api/auth/profile", {
        userId: user.id,
        skinType,
        fitzpatrick: fitz,
        allergies: allergies.trim() || undefined,
        goals: goals.map((id) => ({ id, label: SKIN_GOALS.find((g) => g.id === id)?.label ?? id })),
      });
      setUser({ ...user, ...r.user } as SessionUser);
      toast.success("Profil peau mis à jour");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mise à jour impossible");
    } finally {
      setSavingSkin(false);
    }
  }


  if (!user) return null;

  return (
    <>
      <Reveal className="pt-4 pb-2 flex flex-col gap-6" stagger={0.07}>
      {/* Identité */}
      <RevealItem>
        <section aria-labelledby="me-t" className="k-card overflow-hidden rounded-[24px]">
          <div className="kente-band h-1.5 w-full" aria-hidden="true" />
          <div id="me-t" className="p-5">
            <div className="flex items-center gap-4">
              {/* Photo de profil si posée, sinon l'initiale dorée */}
              <span className="relative shrink-0">
                <span
                  className={`k-glow-gold grid place-items-center h-16 w-16 rounded-full text-[#FFF9EC] font-heading font-black text-2xl overflow-hidden ${avatarSrc ? "" : "bg-gradient-to-br from-[#C8951E] to-[#A0522D]"}`}
                >
                  {avatarSrc ? (
                    <img src={avatarSrc} alt={`Photo de profil de ${user.name}`} className="size-full object-cover" />
                  ) : (
                    (user.name || "K").charAt(0)
                  )}
                </span>
                {/* Pastille appareil: ouvre le sélecteur de photo */}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={avatarBusy}
                  aria-label={hasAvatar ? "Changer ma photo de profil" : "Ajouter une photo de profil"}
                  className="absolute -bottom-0.5 -right-0.5 grid place-items-center size-8 rounded-full bg-card border border-border text-primary shadow-sm hover:scale-105 active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"
                >
                  {avatarBusy ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    void onPickAvatar(e.target.files?.[0]);
                    e.target.value = ""; // permettre de re-choisir le même fichier
                  }}
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-heading font-black text-[22px] leading-tight truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1 font-mono"><Phone size={12} /> {user.phone}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <MapPin size={12} /> {user.district ? `${user.district} · ${user.city || "Abidjan"}` : user.city || "Ville non renseignée"}
                </p>
              </div>
              <button onClick={() => setEdit((v) => !v)} aria-label="Modifier mon profil" className="k-chip h-10 w-10 grid place-items-center rounded-full text-muted-foreground hover:text-primary transition-all focus-visible:outline-2 focus-visible:outline-primary">
                <Pencil size={16} />
              </button>
            </div>
            {edit && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
                <div className="mt-4 space-y-3">
                  {/* Retrait de la photo — sobre, seulement si photo posée */}
                  {hasAvatar && (
                    <button
                      type="button"
                      onClick={() => void removeAvatar()}
                      disabled={avatarBusy}
                      className="k-chip inline-flex items-center gap-1.5 rounded-full px-3 min-h-9 text-[11px] font-semibold hover:text-destructive focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <Trash2 size={12} aria-hidden="true" /> Retirer ma photo de profil
                    </button>
                  )}
                  <div>
                    <label htmlFor="p-name" className="text-[11px] font-semibold text-muted-foreground">Prénom & nom</label>
                    <input id="p-name" value={name} onChange={(e) => setName(e.target.value)} className="k-input mt-1 h-11 w-full rounded-xl px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="p-city" className="text-[11px] font-semibold text-muted-foreground">Ville</label>
                      <input id="p-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Abidjan" className="k-input mt-1 h-11 w-full rounded-xl px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary" />
                    </div>
                    <div>
                      <label htmlFor="p-district" className="text-[11px] font-semibold text-muted-foreground">Commune / Quartier</label>
                      <input id="p-district" value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="Cocody, Marcory…" className="k-input mt-1 h-11 w-full rounded-xl px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary" />
                    </div>
                  </div>
                  <button onClick={saveIdentity} disabled={savingId} className="k-btn-gold h-11 w-full rounded-xl text-primary-foreground text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                    {savingId ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Enregistrer
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </section>
      </RevealItem>

      {/* ── Informations Privilèges & Sécurité Soins ── */}
      <RevealItem>
        <section aria-labelledby="priv-t" className="space-y-2">
          <SectionTitle icon={<Gift size={16} />}><span id="priv-t">Mes Avantages Privilèges &amp; Sécurité Soins</span></SectionTitle>
          <div className="k-card rounded-[24px] p-4 sm:p-5 space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Ces informations permettent à tes instituts partenaires de personnaliser tes offres, te gâter le mois de ton anniversaire et sécuriser tes soins cabine.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Anniversaire Privilège */}
              <div>
                <label htmlFor="p-birth" className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground/85 mb-1">
                  <Calendar size={13} className="text-primary" /> Mon Anniversaire Privilège
                </label>
                <input
                  id="p-birth"
                  type="text"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  placeholder="Ex : 14/05 ou 14 Mai"
                  className="k-input h-10 w-full rounded-xl px-3 text-xs focus-visible:outline-2 focus-visible:outline-primary"
                />
                <p className="text-[10px] text-muted-foreground mt-1">Cadeaux &amp; réductions réservés durant ton mois d&apos;anniversaire 🎂</p>
              </div>

              {/* Commune / Quartier */}
              <div>
                <label htmlFor="p-dist" className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground/85 mb-1">
                  <MapPin size={13} className="text-primary" /> Commune / Quartier favori
                </label>
                <input
                  id="p-dist"
                  type="text"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  placeholder="Ex : Cocody Angré, Zone 4, Plateau, Almadies…"
                  className="k-input h-10 w-full rounded-xl px-3 text-xs focus-visible:outline-2 focus-visible:outline-primary"
                />
                <p className="text-[10px] text-muted-foreground mt-1">Pour t&apos;orienter vers l&apos;institut le plus proche 📍</p>
              </div>
            </div>

            {/* Sécurité Maternité (Grossesse / Allaitement) */}
            <div className="pt-2 border-t border-border/60">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <Baby size={15} className="text-pink-500" /> Es-tu enceinte ou allaitante ?
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Indispensable pour ta sécurité : nous adaptons immédiatement les protocoles en cabine et écartons les actifs déconseillés (huiles essentielles fortes, rétinoïdes, acides trop décapants).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPregnant(!pregnant)}
                  className={cn(
                    "shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all border",
                    pregnant
                      ? "bg-pink-500/15 border-pink-500/40 text-pink-600 dark:text-pink-400 ring-2 ring-pink-500/20"
                      : "bg-muted border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {pregnant ? "🌸 Oui, maternité" : "Non"}
                </button>
              </div>
            </div>

            {/* Canal de contact favori */}
            <div className="pt-2 border-t border-border/60">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground/85 mb-2">
                <MessageCircle size={13} className="text-primary" /> Canal de contact préféré
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "whatsapp", label: "WhatsApp", icon: "💬" },
                  { id: "sms", label: "SMS", icon: "📱" },
                  { id: "call", label: "Appel", icon: "📞" },
                ].map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => setPreferredChannel(ch.id)}
                    className={cn(
                      "flex items-center justify-center gap-1.5 h-9 rounded-xl text-xs font-semibold border transition-all",
                      preferredChannel === ch.id
                        ? "bg-primary/15 border-primary text-primary font-bold shadow-xs"
                        : "bg-background border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <span>{ch.icon}</span>
                    <span>{ch.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Budget mensuel soins */}
            <div className="pt-2 border-t border-border/60">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground/85 mb-2">
                <Coins size={13} className="text-primary" /> Budget mensuel moyen alloué à tes soins
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: "< 15 000 FCFA", label: "< 15 000 F", desc: "Essentiel" },
                  { id: "15 000 - 35 000 FCFA", label: "15k - 35k", desc: "Équilibre" },
                  { id: "35 000 - 75 000 FCFA", label: "35k - 75k", desc: "Intense" },
                  { id: "> 75 000 FCFA", label: "> 75 000 F", desc: "Prestige" },
                ].map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setBeautyBudget(b.id)}
                    className={cn(
                      "flex flex-col items-center justify-center py-1.5 px-2 rounded-xl text-center border transition-all",
                      beautyBudget === b.id
                        ? "bg-gold/15 border-gold text-gold-text font-bold shadow-xs"
                        : "bg-background border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <span className="text-[11.5px] font-mono leading-tight">{b.label}</span>
                    <span className="text-[9.5px] opacity-80">{b.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Bouton d'enregistrement */}
            <button
              onClick={savePreferences}
              disabled={savingPrefs}
              className="k-btn-gold h-10 w-full rounded-xl text-primary-foreground text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-60 transition-transform active:scale-[0.99]"
            >
              {savingPrefs ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              Enregistrer mes privilèges &amp; sécurité soins
            </button>
          </div>
        </section>
      </RevealItem>

      {/* ── Mon kente identitaire — Fils d'Or ── */}
      {gold && (
        <RevealItem>
          <section aria-labelledby="kt-t">
            <SectionTitle icon={<KenteIcon size={16} />}><span id="kt-t">Mon kente identitaire</span></SectionTitle>
            <div className="k-card overflow-hidden rounded-[24px]">
              <div className="p-4 pb-3">
                <div className="rounded-[12px] ring-1 ring-border/80">
                  <KenteIdentity seed={gold.seed} threads={gold.threads} height={110} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-heading font-black text-lg leading-tight">
                      {gold.threads} fil{gold.threads > 1 ? "s" : ""} d&apos;or
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">Rang : {gold.rank}</p>
                  </div>
                  <div className="min-w-[140px] flex-1">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#A0522D] to-[#E3B04B]"
                        style={{ width: `${Math.min(100, Math.round(gold.milestone.progress * 100))}%` }}
                      />
                    </div>
                    <p className="mt-1 text-right text-[10px] text-muted-foreground">
                      {gold.milestone.remaining > 0 ? `palier ${gold.milestone.next} fils` : `palier ${gold.milestone.next} atteint`}
                    </p>
                  </div>
                </div>
              </div>
              <div className="border-t border-dashed border-border px-4 py-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">D’où viennent tes fils</p>
                <div className="flex flex-wrap gap-1.5">
                  {gold.items.filter((it) => it.count > 0).map((it) => (
                    <span key={it.kind} className="rounded-full bg-gold/12 px-2.5 py-1 text-[10.5px] font-semibold text-gold-text">
                      {it.label} · {it.count}
                    </span>
                  ))}
                  {gold.items.every((it) => it.count === 0) && (
                    <span className="text-[11px] text-muted-foreground">Ton premier scan tissera ton premier fil.</span>
                  )}
                </div>
                <p className="mt-2.5 text-[10.5px] leading-relaxed text-muted-foreground">
                  Chaque action vraie — scan, commande, soin en institut, avis, parrainage — ajoute un fil d&apos;or à TON pagne.
                  Le motif est unique : il est tissé depuis ton histoire, il ne se gagne pas, il se vit.
                </p>
              </div>


              <div className="border-t border-border bg-muted/20 px-4 py-2.5 flex items-center justify-between gap-2">
                <p className="text-[10px] text-muted-foreground">
                  Partage ton pagne pour inviter tes amies
                </p>
                <button
                  onClick={() => {
                    const msg = `Bonjour ! 👑\n\nJ'ai déjà tissé ${gold.threads} fil${gold.threads > 1 ? "s" : ""} d'or sur mon pagne Kente Kènè (Rang : ${gold.rank}) !\n\nRejoins-moi sur Kènè pour découvrir ton profil cutané et recevoir ton cadeau de bienvenue : https://kene.app 🌿`;
                    openWhatsApp("", msg);
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#25D366] hover:bg-[#20bd5a] text-white px-2.5 text-[11px] font-bold transition active:scale-95"
                >
                  <MessageCircle size={13} /> Partager mon Kente
                </button>
              </div>
            </div>
          </section>
        </RevealItem>
      )}

      {/* Profil peau */}
      <RevealItem>
        <section aria-labelledby="skin-t">
          <SectionTitle icon={<CauriIcon size={16} />}><span id="skin-t">Mon profil peau</span></SectionTitle>
          <div className="k-card rounded-[24px] p-4 space-y-4">
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground mb-2">Phototype Fitzpatrick</p>
              <div className="grid grid-cols-3 gap-2">
                {FITZPATRICK_CARDS.map((f) => (
                  <button key={f.id} onClick={() => setFitz(f.id)} aria-pressed={fitz === f.id} className={`rounded-[14px] p-1.5 border-2 text-left active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-primary ${fitz === f.id ? "border-primary" : "border-transparent"}`}>
                    <div className="h-8 rounded-lg mb-1" style={{ background: f.gradient }} aria-hidden="true" />
                    <p className="text-[11px] font-bold">{f.id}</p>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground mb-2">Type de peau</p>
              <div className="flex flex-wrap gap-1.5">
                {SKIN_TYPES.map((t) => (
                  <button key={t.id} onClick={() => setSkinType(t.id)} aria-pressed={skinType === t.id} className={`rounded-full px-3 min-h-10 text-xs font-medium transition-all focus-visible:outline-2 focus-visible:outline-primary ${skinType === t.id ? "k-btn-gold text-primary-foreground" : "k-chip"}`}>{t.label}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground mb-2">Objectifs</p>
              <div className="flex flex-wrap gap-1.5">
                {SKIN_GOALS.map((g) => (
                  <button key={g.id} onClick={() => setGoals((s) => (s.includes(g.id) ? s.filter((x) => x !== g.id) : [...s, g.id]))} aria-pressed={goals.includes(g.id)} className={`rounded-full px-3 min-h-10 text-xs font-medium transition-all focus-visible:outline-2 focus-visible:outline-primary ${goals.includes(g.id) ? "k-btn-gold text-primary-foreground" : "k-chip"}`}>{g.label}</button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="p-all" className="text-[11px] font-semibold text-muted-foreground">Allergies</label>
              <textarea id="p-all" value={allergies} onChange={(e) => setAllergies(e.target.value)} rows={2} placeholder="Ex. huile de coco…" className="k-input mt-1 w-full rounded-xl px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary" />
            </div>
            <button onClick={saveSkin} disabled={savingSkin} className="k-btn-gold h-11 w-full rounded-xl text-primary-foreground text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              {savingSkin ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Mettre à jour mon profil peau
            </button>
          </div>
        </section>
      </RevealItem>


      {/* Comparatif Avant / Après (Split-Slider) */}
      {(() => {
        const diagsWithImg = userDiagnoses.filter((d) => Boolean(d?.imageData));
        if (diagsWithImg.length < 2) return null;
        const sorted = [...diagsWithImg].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        const beforeDiag = sorted[0];
        const afterDiag = sorted[sorted.length - 1];
        return (
          <RevealItem>
            <section aria-labelledby="comp-t">
              <SectionTitle icon={<SankofaIcon size={16} />}><span id="comp-t">Évolution de ma peau (Avant / Après)</span></SectionTitle>
              <div className="k-card rounded-[24px] p-4 space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Glisse le curseur pour mesurer les progrès de ton épiderme entre ton bilan d&apos;accueil et ton scan le plus récent.
                </p>
                <BeforeAfterSlider
                  before={{
                    imageUrl: diagImgSrc(beforeDiag.imageData),
                    label: "Bilan J0 Initial",
                    date: formatDate(beforeDiag.createdAt),
                    score: beforeDiag.scoreGlobal,
                  }}
                  after={{
                    imageUrl: diagImgSrc(afterDiag.imageData),
                    label: "Dernier Bilan",
                    date: formatDate(afterDiag.createdAt),
                    score: afterDiag.scoreGlobal,
                  }}
                  showSpectralUvToggle={true}
                />
              </div>
            </section>
          </RevealItem>
        );
      })()}

      {/* Parrainage — le fil qui relie les amies */}
      <ParrainageCard userId={user.id} userName={user.name} />

      {/* Passeport de Peau — QR partageable vers les instituts.
 id kene-passport: destination du Pouce d'Or. */}
      <div id="kene-passport" className="scroll-mt-20">
        <PassportCard userId={user.id} />
      </div>

      {/* Partage des self-scans — la cliente décide, institut par institut */}
      <RevealItem>
        <SharesCard userId={user.id} userName={user.name} />
      </RevealItem>

      {/* Passerelle Paramètres — les réglages de l'application
 (apparence, langue, notifications, sécurité, RGPD, PWA, session)
 vivent désormais dans l'onglet dédié: lien discret en pied de profil. */}
      <RevealItem className="self-center pt-1">
        <button onClick={() => setClientTab("parametres")} className="inline-flex items-center gap-1.5 min-h-10 px-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors rounded focus-visible:outline-2 focus-visible:outline-primary">
          <Settings size={13} /> Paramètres de l&apos;application
        </button>
      </RevealItem>
      </Reveal>
    </>
  );
}
