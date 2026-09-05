"use client";
// Kènè Cliente — Onboarding 3 étapes : téléphone → OTP → profil peau
// ÉCLAT 2026 : aurora plein cadre, GlassCard héro, Reveal en cascade —
// présentation seule, AUCUNE logique touchée (mode pro, OTP, parrainage,
// registerPro/409, slice(0,14) demeurent intacts).
// Mode entreprise (t. 66-b) : même téléphone → OTP, puis formulaire
// institut (jamais de questionnaire peau — le consent santé n'est requis
// que pour la cliente, au diagnostic IA) → POST /api/auth/pro/register.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight, BriefcaseBusiness, Check, ChevronLeft, Flower2, Gift, Loader2, MessageSquareText, ShieldCheck, Smartphone, Sparkles, Stethoscope,
} from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiGet, apiPatch, apiPost } from "@/lib/kene/api";
import { xof } from "@/lib/kene/format";
import { FILLEUL_GIFT } from "@/lib/kene/referral";
import { AuroraBackdrop, Chip, GlassCard, IconBadge, PrimaryCTA, ProgressBar, Reveal, RevealItem } from "@/components/kene/ui2026";
import { KeneLogo } from "@/components/kene/icons";
import { useT } from "@/lib/kene/use-t";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useKene, type SessionUser } from "@/store/kene";
import { FITZPATRICK_CARDS, SKIN_GOALS, SKIN_TYPES, type ApiProRegisterResponse, type ApiUser, readSession } from "./types";

const slide = { initial: { x: 60, opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: -60, opacity: 0 } };

/* Compte entreprise — types d'activité (contrat POST /api/auth/pro/register). */
const PRO_TYPES: {
  id: "institut" | "spa" | "dermo_conseil";
  label: string;
  hint: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}[] = [
  { id: "institut", label: "Institut de beauté", hint: "Soins visage & corps", icon: Sparkles },
  { id: "spa", label: "Spa", hint: "Détente & bien-être", icon: Flower2 },
  { id: "dermo_conseil", label: "Dermo-conseil", hint: "Conseil peau expert", icon: Stethoscope },
];

const PRO_COUNTRIES = [
  { code: "CI", label: "Côte d'Ivoire" },
  { code: "SN", label: "Sénégal" },
] as const;

export function Onboarding() {
  const setUser = useKene((s) => s.setUser);
  const setProTenantId = useKene((s) => s.setProTenantId);
  const setSpace = useKene((s) => s.setSpace);
  const { t } = useT();
  const [step, setStep] = useState(0);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [devCode, setDevCode] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [isNew, setIsNew] = useState(false);
  // Mode d'inscription : cliente (par défaut) ou compte entreprise (institut,
  // spa, dermo-conseillère) — l'étape après l'OTP change, le SMS non.
  const [mode, setMode] = useState<"client" | "pro">("client");
  // Fil du Parrainage : code d'une amie saisi (facultatif) — échangé après
  // authentification (l'API exige un userId valide et garde toutes ses
  // protections : auto-parrainage, échange croisé, double redeem)
  const [parrainCode, setParrainCode] = useState("");

  // profil peau
  const [fitz, setFitz] = useState<string>("V");
  const [skinType, setSkinType] = useState<string>("mixte");
  const [allergies, setAllergies] = useState("");
  const [goals, setGoals] = useState<string[]>(["pih", "eclat"]);
  const [consent, setConsent] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  // compte entreprise (mode pro) — POST /api/auth/pro/register
  const [instituteName, setInstituteName] = useState("");
  const [proType, setProType] = useState<"institut" | "spa" | "dermo_conseil">("institut");
  const [city, setCity] = useState("Abidjan");
  const [country, setCountry] = useState<"CI" | "SN">("CI");
  const [ownerName, setOwnerName] = useState("");
  const [savingPro, setSavingPro] = useState(false);
  const otpRef = useRef<HTMLInputElement>(null);

  const digits = phone.replace(/\D/g, "");
  const phoneValid = digits.length >= 8;

  // Pont « cliente curieuse → compte entreprise » (t. 69-a) : ProfileScreen
  // pose un drapeau sessionStorage AVANT de fermer la session cliente ; au
  // montage de l'onboarding on le consomme et on bascule le mode vers « pro »
  // (comme le ferait le bandeau entreprise de l'étape 1). Effet au montage
  // uniquement, APRÈS hydratation → aucun mismatch (jamais de storage pendant
  // le rendu).
  useEffect(() => {
    try {
      if (sessionStorage.getItem("kene-pro-signup") === "1") {
        sessionStorage.removeItem("kene-pro-signup");
        setMode("pro");
      }
    } catch {
      /* stockage indisponible : l'onboarding reste en mode cliente */
    }
  }, []);
  // Progression indicative du questionnaire (barre ÉCLAT 2026, étape profil) —
  // pure dérivation d'état pour l'affichage, aucun usage métier.
  const profileProgress =
    25 + (goals.length > 0 ? 20 : 0) + (isNew ? (name.trim() ? 15 : 0) : 15) + (allergies.trim() ? 10 : 0) + (consent ? 30 : 0);

  async function requestCode(p = `+225${digits}`) {
    setLoading(true);
    try {
      const res = await apiPost<{ ok: boolean; devCode: string }>("/api/auth/otp/request", { phone: p });
      setDevCode(res.devCode);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Envoi impossible");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function startDemo() {
    setLoading(true);
    try {
      const res = await apiPost<{ ok: boolean; devCode: string }>("/api/auth/otp/request", { phone: "+2250701020304" });
      const v = await apiPost<{ user: ApiUser }>("/api/auth/otp/verify", { phone: "+2250701020304", code: res.devCode });
      setUser(v.user as SessionUser);
      toast.success(`Bienvenue ${v.user.name.split(" ")[0]} — compte démo riche chargé`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Démo indisponible");
    } finally {
      setLoading(false);
    }
  }

  async function verify(code = otp) {
    if (code.length !== 6) return;
    setLoading(true);
    try {
      const v = await apiPost<{ user: ApiUser }>("/api/auth/otp/verify", { phone: `+225${digits}`, code, name: name.trim() || undefined });
      setAuthId(v.user.id);
      if (!v.user.name || v.user.name === "Nouvelle cliente") setIsNew(true);
      if (mode === "pro") {
        // Mode entreprise : JAMAIS de questionnaire peau (phototype/objectifs/
        // consent santé = diagnostic IA cliente uniquement) — directement le
        // formulaire institut après l'OTP. Le prénom connu pré-remplit la
        // gérante, le parrainage reste réservé au mode cliente.
        if (v.user.name && v.user.name !== "Nouvelle cliente") {
          setName(v.user.name.split(" ")[0]);
          setOwnerName(v.user.name);
        }
        setStep(2);
        return;
      }
      // Isolation des comptes (t. 69-a) : un numéro de gérante ou d'admin
      // qui se connecte ici atterrit directement dans SON espace — jamais
      // dans le questionnaire peau ni le parrainage (réservés aux clientes).
      // setUser fait suivre l'espace au rôle (clamp store) → ProApp/AdminApp
      // se monte, Onboarding se démonte.
      if (v.user.role === "pro" || v.user.role === "admin") {
        setUser(v.user as SessionUser);
        toast.success(
          v.user.role === "pro"
            ? `Bienvenue ${v.user.name.split(" ")[0]} — ton espace entreprise t'attend`
            : `Bienvenue ${v.user.name.split(" ")[0]}`
        );
        return;
      }
      const fresh = v.user.consentHealth && v.user.skinType;
      if (!fresh) {
        if (v.user.name && v.user.name !== "Nouvelle cliente") setName(v.user.name.split(" ")[0]);
        setStep(2);
      } else {
        // Compte déjà complet : échange du code AVANT l'entrée (données fraîches)
        const ref = await tryReferral(v.user.id);
        setUser(v.user as SessionUser);
        toast.success(`Bienvenue ${v.user.name.split(" ")[0]}`);
        announceReferral(ref);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Code invalide");
      setOtp("");
    } finally {
      setLoading(false);
    }
  }

  // id de l'utilisatrice authentifiée à l'étape OTP (profil finalisé à l'étape 3)
  const [authId, setAuthId] = useState<string | null>(null);

  /**
   * Échange du code parrain saisi à l'étape OTP — AVANT setUser : les données
   * fraîches (wallet crédité, badge non-lus) doivent être visibles dès que
   * l'accueil se monte. Renvoie le résultat, l'annonce (toasts) revient à
   * l'appelant APRÈS l'entrée dans l'app (ordre narratif).
   */
  async function tryReferral(
    uid: string
  ): Promise<{ ok: true; gift: number; parrainName: string } | { ok: false; error: string } | null> {
    const code = parrainCode.trim();
    if (code.length < 4) return null; // champ vide ou trop court → ignore silencieusement
    try {
      const r = await apiPost<{ ok: boolean; gift: number; parrain: { name: string } }>("/api/referral/redeem", { userId: uid, code });
      return { ok: true, gift: r.gift, parrainName: r.parrain.name };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Code parrain invalide" };
    }
  }

  function announceReferral(ref: Awaited<ReturnType<typeof tryReferral>>) {
    if (!ref) return;
    if (ref.ok) {
      toast.success(`Cadeau de bienvenue : ${xof(ref.gift)} crédités 💛`, {
        description: `Merci ${ref.parrainName.split(" ")[0]} ! Elle recevra sa récompense dès ta première commande.`,
      });
    } else {
      toast.error(ref.error);
    }
  }

  async function saveProfile() {
    if (!authId) return toast.error("Session expirée — reviens puis revalide le code");
    setSavingProfile(true);
    try {
      await apiPost("/api/auth/consent", { userId: authId });
      const r = await apiPatch<{ user: ApiUser }>("/api/auth/profile", {
        userId: authId,
        name: name.trim() || undefined,
        skinType,
        fitzpatrick: fitz,
        allergies: allergies.trim() || undefined,
        goals: goals.map((id) => ({ id, label: SKIN_GOALS.find((g) => g.id === id)?.label ?? id })),
      });
      // Le Fil du Parrainage commence ici : cadeau de bienvenue dès l'inscription.
      // Échange AVANT setUser → l'accueil se monte avec le wallet déjà crédité
      // et la cloche déjà badgée ; l'annonce suit l'entrée (ordre narratif).
      const ref = await tryReferral(authId);
      setUser(r.user as SessionUser);
      toast.success("Profil beauté créé — bienvenue dans la famille Kènè");
      announceReferral(ref);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setSavingProfile(false);
    }
  }

  /** Création du compte entreprise (POST /api/auth/pro/register, contrat figé
   *  t. 66) : 201 → session + tenant mémorisés → espace Pro. 409 (ce numéro
   *  gère déjà un espace) : ApiError ne transporte pas le body → GET session
   *  de secours, on y retourne si le compte est bien passé pro. */
  async function registerPro() {
    if (!authId) return toast.error("Session expirée — reviens puis revalide le code");
    const institute = instituteName.trim();
    if (institute.length < 3 || institute.length > 60) {
      return toast.error("Nom de l'institut : 3 à 60 caractères");
    }
    setSavingPro(true);
    try {
      const r = await apiPost<ApiProRegisterResponse>("/api/auth/pro/register", {
        userId: authId,
        instituteName: institute,
        ownerName: ownerName.trim() || undefined,
        city: city.trim() || "Abidjan",
        country,
        type: proType,
      });
      setUser(r.user as SessionUser);
      setProTenantId(r.tenant.id);
      setSpace("pro");
      toast.success(`« ${r.tenant.name} » est né 🎉 Bienvenue dans ton espace Pro`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // Lecture de secours : si le compte est déjà pro (et qu'on retrouve
        // le tenant), on entre directement dans l'espace entreprise — sinon
        // on affiche l'erreur renvoyée par l'API.
        let entered = false;
        try {
          const s = readSession(await apiGet<unknown>(`/api/auth/session?userId=${authId}`));
          if (s.user && s.user.role === "pro") {
            setUser(s.user as SessionUser);
            if (s.tenantId) setProTenantId(s.tenantId);
            setSpace("pro");
            entered = true;
            toast.success(
              s.tenantName
                ? `Tu gères déjà « ${s.tenantName} » — on y retourne`
                : "Tu gères déjà ton espace entreprise — on y retourne",
            );
          }
        } catch {
          /* session injoignable → message du 409 ci-dessous */
        }
        if (!entered) toast.error(e.message || "Un espace entreprise existe déjà pour ce numéro");
      } else {
        toast.error(e instanceof Error ? e.message : "Création impossible");
      }
    } finally {
      setSavingPro(false);
    }
  }

  return (
    <div className="relative isolate mx-auto w-full max-w-[430px] min-h-[80vh] overflow-hidden">
      {/* Atmosphère ÉCLAT 2026 — l'écran de connexion vit sur l'aurora plein
          cadre (fixed, -z-10) comme l'app connectée ; isolate garantit que les
          lueurs passent au-dessus du fond de page, sous le contenu. */}
      <AuroraBackdrop />
      {/* ───── Étape 1 — Téléphone ───── */}
      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div key="s0" {...slide} transition={{ duration: 0.35 }} className="flex flex-col min-h-[70vh]">
            <Reveal y={18} className="flex flex-col flex-1">
              <div className="relative h-60">
                <img src="/hero/hero-client.webp" alt="Portrait d'une femme africaine au teint lumineux" className="absolute inset-0 h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/25 to-transparent" />
                <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between">
                  <KeneLogo size={42} />
                  <span className="rounded-full bg-[#6B2416]/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#FFF9EC]">POC démo</span>
                </div>
              </div>
              <div className="px-5 -mt-2 pb-8 flex flex-col gap-5 flex-1">
                <RevealItem>
                  <h1 className="kente-text-flow font-heading font-black text-[22px] leading-tight">{t("onboarding.title")}</h1>
                  <p className="text-sm text-muted-foreground mt-2">
                    {t("onboarding.subtitle")}
                  </p>
                </RevealItem>
                <RevealItem>
                  <GlassCard hero grain className="rounded-[26px] p-5">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="phone" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {t("onboarding.phone.label")}
                      </label>
                      {mode === "pro" && (
                        <span className="rounded-full bg-primary/10 text-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide">
                          Entreprise
                        </span>
                      )}
                    </div>
                    <div className="relative mt-2.5">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-mono text-[15px] text-muted-foreground">+225</span>
                      <input
                        id="phone"
                        ref={otpRef}
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="07 01 02 03 04"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/[^\d\s]/g, "").slice(0, 14))}
                        className="k-input h-14 w-full rounded-2xl pl-16 pr-4 text-base font-mono tracking-wider text-foreground placeholder:text-muted-foreground/70"
                      />
                    </div>
                    <PrimaryCTA
                      onClick={async () => {
                        if (!phoneValid) return toast.error("Numéro incomplet (8 chiffres min.)");
                        if (await requestCode()) {
                          setStep(1);
                          toast.success("Code envoyé par SMS (simulé)");
                        }
                      }}
                      disabled={loading || !phoneValid}
                      className="mt-4 w-full"
                    >
                      {loading ? <Loader2 size={18} className="animate-spin" /> : <MessageSquareText size={18} />}
                      {t("onboarding.cta")}
                    </PrimaryCTA>
                    {/* « Rester connectée » rassurée dès l'inscription (réalité
                        technique : localStorage kene-store, session par appareil). */}
                    <p className="mt-3 flex items-start justify-center gap-1.5 text-[11px] leading-relaxed text-muted-foreground text-center">
                      <Smartphone size={13} className="shrink-0 mt-0.5" aria-hidden="true" />
                      Une seule connexion suffit : tu restes connectée sur cet appareil, comme sur tes applis préférées.
                    </p>
                  </GlassCard>
                </RevealItem>

                {/* Compte entreprise — institut, spa, dermo-conseillère.
                    NB cascade : k-card écrase border, ring et bg sur le même
                    élément → l'anneau pointillé vit sur l'enveloppe, le verre
                    sur la carte interne (glass + dashed ring, signature 66-b). */}
                <RevealItem>
                  {mode === "client" ? (
                    <div className="rounded-[22px] border border-dashed border-primary/40 p-[4px]">
                      <div className="k-card rounded-[18px] p-3.5">
                        <div className="flex items-start gap-3">
                          <IconBadge icon={<BriefcaseBusiness size={18} />} size="sm" tone="gold" />
                          <div className="min-w-0">
                            <p className="text-xs leading-relaxed text-muted-foreground">Tu es un institut, un spa ou une dermo-conseillère ?</p>
                            <button
                              onClick={() => setMode("pro")}
                              className="mt-1 -ml-2 px-2 min-h-11 inline-flex items-center text-sm font-bold text-primary underline underline-offset-4 decoration-primary/40 hover:decoration-primary active:scale-[0.98] transition-transform focus-visible:outline-2 focus-visible:outline-primary rounded"
                            >
                              Créer un compte entreprise
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-[22px] border border-dashed border-primary/60 p-[4px]" aria-live="polite">
                      <div className="k-card rounded-[18px] p-3.5">
                        <div className="flex items-start gap-3">
                          <span className="k-btn-gold grid h-10 w-10 place-items-center rounded-[12px] text-primary-foreground shrink-0" aria-hidden="true">
                            <BriefcaseBusiness size={19} />
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-primary uppercase tracking-wide">Inscription entreprise</p>
                            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                              Institut · Spa · Dermo-conseil — après ton code SMS, tu créeras ton espace de gestion (agenda, caisse, CRM).
                            </p>
                            <button
                              onClick={() => setMode("client")}
                              className="mt-1 -ml-2 px-2 min-h-11 inline-flex items-center text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground active:scale-[0.98] transition-transform focus-visible:outline-2 focus-visible:outline-primary rounded"
                            >
                              Tu es une cliente ? Revenir au compte personnel
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </RevealItem>
                <RevealItem>
                  <button
                    onClick={startDemo}
                    disabled={loading}
                    className="mx-auto inline-flex items-center min-h-11 px-3 text-[12px] text-muted-foreground underline underline-offset-4 decoration-dotted hover:text-primary focus-visible:outline-2 focus-visible:outline-primary rounded"
                  >
                    Démo — Entrer comme Mariam (compte riche : 3 diagnostics, wallet)
                  </button>
                </RevealItem>
                <RevealItem className="mt-auto">
                  <p className="text-[11px] leading-relaxed text-muted-foreground text-center">
                    {t("onboarding.legal")}
                  </p>
                </RevealItem>
              </div>
            </Reveal>
          </motion.div>
        )}

        {/* ───── Étape 2 — OTP ───── */}
        {step === 1 && (
          <motion.div key="s1" {...slide} transition={{ duration: 0.35 }} className="px-5 pt-10 flex flex-col min-h-[70vh]">
            <Reveal y={18}>
              <RevealItem>
                <button onClick={() => setStep(0)} className="self-start inline-flex items-center gap-1 min-h-11 px-2 -ml-2 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary rounded" aria-label="Retour">
                  <ChevronLeft size={16} aria-hidden="true" /> Modifier le numéro
                </button>
              </RevealItem>
              <RevealItem>
                <h1 className="font-heading font-black text-xl mt-6">Confirme ton code</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Saisis les 6 chiffres envoyés au <span className="font-mono">+225{digits}</span>
                </p>
              </RevealItem>
              <RevealItem className="mt-8">
                <div className="k-card rounded-[22px] p-5 flex justify-center">
                  <div className="flex flex-col items-center gap-2">
                    <span id="otp-label" className="sr-only">Code à 6 chiffres reçu par SMS</span>
                    <InputOTP maxLength={6} value={otp} onChange={(v) => setOtp(v)} autoFocus autoComplete="one-time-code" aria-labelledby="otp-label">
                      <InputOTPGroup>
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                          <InputOTPSlot key={i} index={i} />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                </div>
              </RevealItem>
              <RevealItem>
                <PrimaryCTA
                  onClick={() => verify()}
                  disabled={otp.length !== 6 || loading}
                  className="mt-8 w-full"
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
                  Continuer
                </PrimaryCTA>
              </RevealItem>
              <RevealItem>
                <div className="mt-6 rounded-[22px] border border-dashed border-primary/50 p-[4px]">
                  <div className="k-card rounded-[18px] p-3.5 text-center">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-primary font-semibold">SMS simulé (POC)</p>
                    <button onClick={() => { setOtp(devCode); setTimeout(() => verify(devCode), 250); }} className="mt-2 font-mono text-2xl font-black tracking-[0.3em] text-primary hover:scale-105 active:scale-95 transition-transform" aria-label={`Code reçu ${devCode}, remplir automatiquement`}>
                      {devCode}
                    </button>
                    <p className="text-[11px] text-muted-foreground mt-1">Touche le code pour le remplir</p>
                  </div>
                </div>
              </RevealItem>
              <RevealItem>
                <button onClick={async () => { if (await requestCode(`+225${digits}`)) toast.success("Nouveau code envoyé"); }} className="mt-4 mx-auto inline-flex items-center min-h-11 px-3 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary rounded">
                  Renvoyer le code
                </button>
              </RevealItem>

              {/* Fil du Parrainage — code d'une amie (facultatif, cliente uniquement) */}
              {mode === "client" && (
                <RevealItem>
                  <div className="mt-6 k-card rounded-[22px] p-4">
                    <label htmlFor="parrain" className="flex items-center gap-1.5 text-xs font-semibold">
                      <Gift size={14} className="text-gold-text" aria-hidden="true" />
                      J&apos;ai un code parrain <span className="font-normal text-muted-foreground">(facultatif)</span>
                    </label>
                    <input
                      id="parrain"
                      value={parrainCode}
                      onChange={(e) => setParrainCode(e.target.value.toUpperCase().replace(/\s+/g, "").slice(0, 24))}
                      placeholder="EX. MARIAM-KENE"
                      autoComplete="off"
                      className="mt-2 k-input h-11 w-full rounded-2xl px-3.5 font-mono text-sm tracking-wider text-foreground placeholder:text-muted-foreground/70"
                      aria-describedby="parrain-hint"
                    />
                    <p id="parrain-hint" className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                      {xof(FILLEUL_GIFT)} de bienvenue crédités sur ton wallet dès ton inscription — et ta parraine reçoit sa récompense à ta première commande.
                    </p>
                  </div>
                </RevealItem>
              )}
              {mode === "pro" && (
                <RevealItem>
                  <p className="mt-6 k-card rounded-[22px] p-4 text-[11px] leading-relaxed text-muted-foreground">
                    <BriefcaseBusiness size={13} className="inline mr-1.5 -mt-0.5 text-primary" aria-hidden="true" />
                    Ton espace entreprise sera créé juste après ce code — agenda, caisse, CRM et diagnostics en cabine t&apos;attendent.
                  </p>
                </RevealItem>
              )}
            </Reveal>
          </motion.div>
        )}

        {/* ───── Étape 3 (pro) — Compte entreprise ───── */}
        {step === 2 && mode === "pro" && (
          <motion.div key="s2pro" {...slide} transition={{ duration: 0.35 }} className="px-5 pt-10 pb-10 flex flex-col min-h-[70vh]">
            <Reveal y={18} className="flex flex-col gap-5 flex-1">
              <RevealItem>
                <button onClick={() => setStep(1)} className="self-start inline-flex items-center gap-1 min-h-11 px-2 -ml-2 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary rounded" aria-label="Retour au code SMS">
                  <ChevronLeft size={16} aria-hidden="true" /> Modifier le numéro
                </button>
              </RevealItem>

              <RevealItem>
                <div>
                  <div className="kente-band h-1.5 w-14 rounded-full mb-3" aria-hidden="true" />
                  <h1 className="font-heading font-black text-xl">Crée ton espace entreprise</h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    Agenda, caisse, CRM et diagnostics en cabine — pensés pour les instituts qui chérissent les peaux mélanodermes.
                  </p>
                </div>
              </RevealItem>

              <RevealItem>
                <div>
                  <label htmlFor="institute-name" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Nom de l&apos;institut
                  </label>
                  <input
                    id="institute-name"
                    value={instituteName}
                    onChange={(e) => setInstituteName(e.target.value.slice(0, 60))}
                    placeholder="Ex. Institut Karité & Lumière"
                    autoComplete="organization"
                    className="mt-2 k-input h-12 w-full rounded-2xl px-4 text-base text-foreground placeholder:text-muted-foreground/70"
                    aria-describedby="institute-hint"
                  />
                  <p id="institute-hint" className="mt-1.5 text-[11px] text-muted-foreground">
                    3 à 60 caractères — c&apos;est le nom que verront tes clientes.
                  </p>
                </div>
              </RevealItem>

              <RevealItem>
                <fieldset>
                  <legend className="text-sm font-semibold mb-2">Type d&apos;activité</legend>
                  <div className="grid grid-cols-3 gap-2">
                    {PRO_TYPES.map((ty) => {
                      const Icon = ty.icon;
                      return (
                        <button
                          key={ty.id}
                          type="button"
                          onClick={() => setProType(ty.id)}
                          aria-pressed={proType === ty.id}
                          className="k-card relative rounded-[22px] p-3 text-left transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-primary"
                        >
                          {proType === ty.id && (
                            <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[22px] bg-primary/8 ring-2 ring-inset ring-primary/60" />
                          )}
                          <div className="relative">
                            <IconBadge icon={<Icon size={18} />} size="sm" tone="gold" />
                            <p className="font-heading font-bold text-[13px] mt-2 leading-tight">{ty.label}</p>
                            <p className="text-[10px] leading-tight text-muted-foreground mt-0.5">{ty.hint}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              </RevealItem>

              <RevealItem>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="pro-city" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Ville
                    </label>
                    <input
                      id="pro-city"
                      value={city}
                      onChange={(e) => setCity(e.target.value.slice(0, 40))}
                      placeholder="Abidjan"
                      autoComplete="address-level2"
                      className="mt-2 k-input h-12 w-full rounded-2xl px-4 text-sm text-foreground placeholder:text-muted-foreground/70"
                    />
                  </div>
                  <fieldset>
                    <legend className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pays</legend>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {PRO_COUNTRIES.map((c) => (
                        <Chip key={c.code} selected={country === c.code} onClick={() => setCountry(c.code)} className="min-h-12 w-full justify-center">
                          {c.label}
                        </Chip>
                      ))}
                    </div>
                  </fieldset>
                </div>
              </RevealItem>

              <RevealItem>
                <div>
                  <label htmlFor="owner-name" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Ton nom de gérante <span className="font-normal normal-case">(facultatif)</span>
                  </label>
                  <input
                    id="owner-name"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value.slice(0, 60))}
                    placeholder="Ex. Fatou Koné"
                    autoComplete="name"
                    className="mt-2 k-input h-12 w-full rounded-2xl px-4 text-sm text-foreground placeholder:text-muted-foreground/70"
                  />
                </div>
              </RevealItem>

              <RevealItem>
                <PrimaryCTA
                  onClick={() => void registerPro()}
                  disabled={savingPro || instituteName.trim().length < 3}
                  className="sticky bottom-4 w-full"
                >
                  {savingPro ? <Loader2 size={18} className="animate-spin" /> : <BriefcaseBusiness size={18} />}
                  Créer mon espace entreprise
                </PrimaryCTA>
              </RevealItem>
              <RevealItem>
                <p className="text-[11px] leading-relaxed text-muted-foreground text-center">
                  Paiements simulés (POC) · Tes clientes continuent de réserver et commander depuis l&apos;app cliente.
                </p>
              </RevealItem>
            </Reveal>
          </motion.div>
        )}

        {/* ───── Étape 3 (cliente) — Profil peau ───── */}
        {step === 2 && mode === "client" && (
          <motion.div key="s2" {...slide} transition={{ duration: 0.35 }} className="px-5 pt-8 pb-10 flex flex-col min-h-[70vh]">
            <Reveal y={18} className="flex flex-col gap-6 flex-1">
              <RevealItem>
                <div>
                  <div className="kente-band h-1.5 w-14 rounded-full mb-3" aria-hidden="true" />
                  <h1 className="font-heading font-black text-xl">Parle-nous de ta peau</h1>
                  <p className="text-sm text-muted-foreground mt-1">2 minutes pour personnaliser ton diagnostic et tes recommandations.</p>
                  <ProgressBar value={profileProgress} className="mt-4" />
                </div>
              </RevealItem>

              <RevealItem>
                <section aria-labelledby="fitz-t">
                  <h2 id="fitz-t" className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <IconBadge icon={<Sparkles size={14} />} size="sm" tone="gold" /> Phototype Fitzpatrick
                  </h2>
                  <div className="grid grid-cols-3 gap-2">
                    {FITZPATRICK_CARDS.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setFitz(f.id)}
                        aria-pressed={fitz === f.id}
                        className="k-card relative rounded-[22px] p-2.5 text-left transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        {fitz === f.id && (
                          <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[22px] bg-primary/8 ring-2 ring-inset ring-primary/60" />
                        )}
                        <div className="relative">
                          <div className="h-12 rounded-xl mb-2" style={{ background: f.gradient }} aria-hidden="true" />
                          <p className="font-heading font-bold text-sm">{f.id}</p>
                          <p className="text-[10px] leading-tight text-muted-foreground mt-0.5 line-clamp-3">{f.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              </RevealItem>

              <RevealItem>
                <section>
                  <h2 className="text-sm font-semibold mb-2">Type de peau</h2>
                  <div className="flex flex-wrap gap-2">
                    {SKIN_TYPES.map((t) => (
                      <Chip key={t.id} selected={skinType === t.id} onClick={() => setSkinType(t.id)}>
                        {t.label}
                      </Chip>
                    ))}
                  </div>
                </section>
              </RevealItem>

              <RevealItem>
                <section>
                  <h2 className="text-sm font-semibold mb-2">Mes objectifs</h2>
                  <div className="flex flex-wrap gap-2">
                    {SKIN_GOALS.map((g) => (
                      <Chip key={g.id} selected={goals.includes(g.id)} onClick={() => setGoals((s) => (s.includes(g.id) ? s.filter((x) => x !== g.id) : [...s, g.id]))}>
                        {g.label}
                      </Chip>
                    ))}
                  </div>
                </section>
              </RevealItem>

              <RevealItem>
                <section>
                  <h2 className="text-sm font-semibold mb-2">Allergies connues <span className="text-muted-foreground font-normal">(facultatif)</span></h2>
                  <label htmlFor="allergies-input" className="sr-only">Allergies connues, facultatif</label>
                  <textarea
                    id="allergies-input"
                    value={allergies}
                    onChange={(e) => setAllergies(e.target.value)}
                    rows={2}
                    placeholder="Ex. huile de coco, parfums, latex…"
                    className="k-input w-full rounded-2xl px-3.5 py-2.5 text-sm min-h-11 text-foreground placeholder:text-muted-foreground/70"
                  />
                </section>
              </RevealItem>

              {isNew && (
                <RevealItem>
                  <div>
                    <label htmlFor="pname" className="text-sm font-semibold mb-2 block">Mon prénom</label>
                    <input id="pname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Mariam" className="k-input h-12 w-full rounded-2xl px-4 text-base text-foreground placeholder:text-muted-foreground/70" />
                  </div>
                </RevealItem>
              )}

              <RevealItem>
                <label className="k-card rounded-[22px] flex items-start gap-3 p-3.5 cursor-pointer active:scale-[0.99] transition-transform">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#C8951E]" />
                  <span className="text-[12px] leading-relaxed text-muted-foreground">
                    <ShieldCheck size={14} className="inline mr-1 text-primary" />
                    J&apos;accepte le traitement de mes données santé (photos de peau, historique) pour mes diagnostics personnalisés. Chiffrées, jamais partagées sans mon accord. <span className="text-primary font-semibold">Obligatoire.</span>
                  </span>
                </label>
              </RevealItem>

              <RevealItem>
                <PrimaryCTA
                  onClick={async () => {
                    if (!consent) return toast.error("Le consentement santé est obligatoire pour le diagnostic");
                    await saveProfile();
                  }}
                  disabled={!consent || savingProfile}
                  className="sticky bottom-4 w-full"
                >
                  {savingProfile ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                  Créer mon espace beauté
                </PrimaryCTA>
              </RevealItem>
            </Reveal>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
