"use client";
// Kènè Cliente — Onboarding 3 étapes : téléphone → OTP → profil peau
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, ChevronLeft, Loader2, MessageSquareText, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { apiPatch, apiPost } from "@/lib/kene/api";
import { KeneLogo } from "@/components/kene/icons";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useKene, type SessionUser } from "@/store/kene";
import { FITZPATRICK_CARDS, SKIN_GOALS, SKIN_TYPES, type ApiUser } from "./types";

const slide = { initial: { x: 60, opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: -60, opacity: 0 } };

function Chip({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3.5 py-2 text-[13px] font-medium transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-primary ${
        active ? "border-primary bg-primary text-primary-foreground shadow" : "border-border bg-card text-foreground/80 hover:border-primary/50"
      }`}
    >
      {children}
    </button>
  );
}

export function Onboarding() {
  const setUser = useKene((s) => s.setUser);
  const [step, setStep] = useState(0);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [devCode, setDevCode] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [isNew, setIsNew] = useState(false);

  // profil peau
  const [fitz, setFitz] = useState<string>("V");
  const [skinType, setSkinType] = useState<string>("mixte");
  const [allergies, setAllergies] = useState("");
  const [goals, setGoals] = useState<string[]>(["pih", "eclat"]);
  const [consent, setConsent] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const otpRef = useRef<HTMLInputElement>(null);

  const digits = phone.replace(/\D/g, "");
  const phoneValid = digits.length >= 8;

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
      const fresh = v.user.consentHealth && v.user.skinType;
      if (!v.user.name || v.user.name === "Nouvelle cliente") setIsNew(true);
      if (!fresh) {
        if (v.user.name && v.user.name !== "Nouvelle cliente") setName(v.user.name.split(" ")[0]);
        setStep(2);
      } else {
        setUser(v.user as SessionUser);
        toast.success(`Bienvenue ${v.user.name.split(" ")[0]}`);
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
      setUser(r.user as SessionUser);
      toast.success("Profil beauté créé — bienvenue dans la famille Kènè");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setSavingProfile(false);
    }
  }

  return (
    <div className="relative mx-auto w-full max-w-[430px] min-h-[70vh] bg-background overflow-hidden">
      {/* ───── Étape 1 — Téléphone ───── */}
      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div key="s0" {...slide} transition={{ duration: 0.35 }} className="flex flex-col min-h-[70vh]">
            <div className="relative h-60">
              <img src="/hero/hero-client.webp" alt="Portrait d'une femme africaine au teint lumineux" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/25 to-transparent" />
              <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between">
                <KeneLogo size={42} />
                <span className="rounded-full bg-[#1A1410]/70 backdrop-blur px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-[#F8F1E4]">POC démo</span>
              </div>
            </div>
            <div className="px-5 -mt-2 pb-8 flex flex-col gap-5 flex-1">
              <div>
                <h1 className="font-heading font-black text-2xl leading-tight">La beauté mélanoderme, de A à Z.</h1>
                <p className="text-sm text-muted-foreground mt-2">
                  Diagnostic IA multi-zones, boutique botaniques, instituts partenaires et coach Dr. Kènè — pensés pour les peaux Fitzpatrick IV–VI.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <label htmlFor="phone" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Mon numéro
                </label>
                <div className="flex items-center gap-2 mt-2">
                  <span className="h-12 px-3 grid place-items-center rounded-xl border border-border bg-muted font-mono text-sm">+225</span>
                  <Input
                    id="phone"
                    ref={otpRef}
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="07 01 02 03 04"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/[^\d\s]/g, "").slice(0, 12))}
                    className="h-12 text-base font-mono tracking-wider"
                  />
                </div>
                <button
                  onClick={async () => {
                    if (!phoneValid) return toast.error("Numéro incomplet (8 chiffres min.)");
                    if (await requestCode()) {
                      setStep(1);
                      toast.success("Code envoyé par SMS (simulé)");
                    }
                  }}
                  disabled={loading || !phoneValid}
                  className="mt-4 h-12 w-full rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <MessageSquareText size={18} />}
                  Recevoir mon code
                </button>
              </div>
              <button
                onClick={startDemo}
                disabled={loading}
                className="mx-auto text-[12px] text-muted-foreground underline underline-offset-4 decoration-dotted hover:text-primary focus-visible:outline-2 focus-visible:outline-primary rounded"
              >
                Démo — Entrer comme Mariam (compte riche : 3 diagnostics, wallet)
              </button>
              <p className="mt-auto text-[11px] leading-relaxed text-muted-foreground text-center">
                En continuant, tu acceptes les conditions Kènè. Données santé chiffrées, jamais revendues.
              </p>
            </div>
          </motion.div>
        )}

        {/* ───── Étape 2 — OTP ───── */}
        {step === 1 && (
          <motion.div key="s1" {...slide} transition={{ duration: 0.35 }} className="px-5 pt-10 flex flex-col min-h-[70vh]">
            <button onClick={() => setStep(0)} className="self-start inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary rounded" aria-label="Retour">
              <ChevronLeft size={16} /> Modifier le numéro
            </button>
            <h1 className="font-heading font-black text-xl mt-6">Confirme ton code</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Saisis les 6 chiffres envoyés au <span className="font-mono">+225{digits}</span>
            </p>
            <div className="mt-8 flex justify-center">
              <InputOTP maxLength={6} value={otp} onChange={(v) => setOtp(v)} autoFocus>
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
            <button
              onClick={() => verify()}
              disabled={otp.length !== 6 || loading}
              className="mt-8 h-12 rounded-xl bg-primary text-primary-foreground font-semibold shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
              Continuer
            </button>
            <div className="mt-6 rounded-2xl border border-dashed border-primary/50 bg-primary/5 p-4 text-center">
              <p className="text-[10px] uppercase tracking-[0.14em] text-primary font-semibold">SMS simulé (POC)</p>
              <button onClick={() => { setOtp(devCode); setTimeout(() => verify(devCode), 250); }} className="mt-2 font-mono text-2xl font-black tracking-[0.3em] text-primary hover:scale-105 active:scale-95 transition-transform" aria-label={`Code reçu ${devCode}, remplir automatiquement`}>
                {devCode}
              </button>
              <p className="text-[11px] text-muted-foreground mt-1">Touche le code pour le remplir</p>
            </div>
            <button onClick={async () => { if (await requestCode(`+225${digits}`)) toast.success("Nouveau code envoyé"); }} className="mt-4 mx-auto text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
              Renvoyer le code
            </button>
          </motion.div>
        )}

        {/* ───── Étape 3 — Profil peau ───── */}
        {step === 2 && (
          <motion.div key="s2" {...slide} transition={{ duration: 0.35 }} className="px-5 pt-8 pb-10 flex flex-col min-h-[70vh] gap-6">
            <div>
              <div className="kente-band h-1.5 w-14 rounded-full mb-3" aria-hidden="true" />
              <h1 className="font-heading font-black text-xl">Parle-nous de ta peau</h1>
              <p className="text-sm text-muted-foreground mt-1">2 minutes pour personnaliser ton diagnostic et tes recommandations.</p>
            </div>

            <section aria-labelledby="fitz-t">
              <h2 id="fitz-t" className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Sparkles size={15} className="text-primary" /> Phototype Fitzpatrick
              </h2>
              <div className="grid grid-cols-3 gap-2">
                {FITZPATRICK_CARDS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFitz(f.id)}
                    aria-pressed={fitz === f.id}
                    className={`rounded-2xl p-2 text-left border-2 transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-primary ${fitz === f.id ? "border-primary shadow-md" : "border-transparent"}`}
                  >
                    <div className="h-12 rounded-xl mb-2" style={{ background: f.gradient }} aria-hidden="true" />
                    <p className="font-heading font-bold text-sm">{f.id}</p>
                    <p className="text-[10px] leading-tight text-muted-foreground mt-0.5 line-clamp-3">{f.desc}</p>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-sm font-semibold mb-2">Type de peau</h2>
              <div className="flex flex-wrap gap-2">
                {SKIN_TYPES.map((t) => (
                  <Chip key={t.id} active={skinType === t.id} onClick={() => setSkinType(t.id)}>
                    {t.label}
                  </Chip>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-sm font-semibold mb-2">Mes objectifs</h2>
              <div className="flex flex-wrap gap-2">
                {SKIN_GOALS.map((g) => (
                  <Chip key={g.id} active={goals.includes(g.id)} onClick={() => setGoals((s) => (s.includes(g.id) ? s.filter((x) => x !== g.id) : [...s, g.id]))}>
                    {g.label}
                  </Chip>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-sm font-semibold mb-2">Allergies connues <span className="text-muted-foreground font-normal">(facultatif)</span></h2>
              <textarea
                value={allergies}
                onChange={(e) => setAllergies(e.target.value)}
                rows={2}
                placeholder="Ex. huile de coco, parfums, latex…"
                className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm min-h-11 focus-visible:outline-2 focus-visible:outline-primary"
              />
            </section>

            {isNew && (
              <div>
                <label htmlFor="pname" className="text-sm font-semibold mb-2 block">Mon prénom</label>
                <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Mariam" className="h-12" />
              </div>
            )}

            <label className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3.5 cursor-pointer active:scale-[0.99] transition-transform">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#C8951E]" />
              <span className="text-[12px] leading-relaxed text-muted-foreground">
                <ShieldCheck size={14} className="inline mr-1 text-primary" />
                J&apos;accepte le traitement de mes données santé (photos de peau, historique) pour mes diagnostics personnalisés. Chiffrées, jamais partagées sans mon accord. <span className="text-primary font-semibold">Obligatoire.</span>
              </span>
            </label>

            <button
              onClick={async () => {
                if (!consent) return toast.error("Le consentement santé est obligatoire pour le diagnostic");
                await saveProfile();
              }}
              disabled={!consent || savingProfile}
              className="h-12 rounded-xl bg-primary text-primary-foreground font-semibold shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2 sticky bottom-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
            >
              {savingProfile ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
              Créer mon espace beauté
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
