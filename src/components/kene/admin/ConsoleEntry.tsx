"use client";
// Kènè — Porte dédiée de la Console (t. 130): « /console » est le SEUL
// chemin vers l'espace administrateur, séparé de la vitrine publique
// (standard 2026: le back-office ne vit pas sur la page de login grand
// public — cf. /wp-admin, dashboard.stripe.com). Le middleware réécrit
// /console → page unique « / » ; ce composant détecte l'entrée par
// location.pathname et monte l'écran de connexion CONSOLE.
//
// Trois états:
// • session admin → AdminApp (chunk dynamique — le code splitting est
//   préservé: la console ne rejoint le bundle client qu'ici);
// • session non-admin → carte d'orientation (« ton compte vit dans l'app »);
// • pas de session → ConsoleLogin: numéro → PASSKEY (cérémonie WebAuthn si
//   un appareil est enregistré — MFA résistante au hameçonnage, NIST
//   800-63B-4) ou CODE à 6 chiffres (contexte « console » côté otp/verify —
//   l'arbitrage serveur refuse tout compte non admin sur ce lien).
//
// ConsoleRedirect: une session admin qui ouvre « / » (vitrine) est
// redirigée vers /console — l'espace admin n'existe plus hors de son lien.
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { ArrowRight, Fingerprint, KeyRound, Loader2, MessageSquareText, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { apiPost, ApiError } from "@/lib/kene/api";
import { rememberAccount } from "@/lib/kene/last-account";
import { browserSupportsWebAuthn, startAuthentication } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { BootSkeleton } from "@/components/kene/client/BootSkeleton";
import { KeneEmblem } from "@/components/kene/icons";
import { useKene, type SessionUser } from "@/store/kene";
import type { ApiUser } from "@/components/kene/client/types";

// Même chunk que page.tsx (next/dynamic met en cache — pas de double charge).
const AdminApp = dynamic(() => import("@/components/kene/admin/AdminApp").then((m) => ({ default: m.AdminApp })), {
  ssr: false,
  loading: () => <BootSkeleton />,
});

// ─────────────── Détection de l'entrée (/console vs vitrine) ───────────────

export type EntryKind = "console" | "app" | null;

/** Abonnement popstate: les changements de pathname hors SPA (liens <a>,
 * back/forward) re-résolvent l'entrée — les navigations internes à l'app ne
 * touchent jamais pathname. */
function subscribeEntry(cb: () => void): () => void {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
}

/** Snapshot client: « console » si l'URL est /console, « app » sinon. */
function entrySnapshot(): Exclude<EntryKind, null> {
  return window.location.pathname.replace(/\/+$/, "") === "/console" ? "console" : "app";
}

/** « console » si l'URL courante est /console, « app » sinon, null au rendu
 * serveur (BootSkeleton — la page unique est partagée par le rewrite).
 * Pattern useSyncExternalStore: lecture de window SANS mismatch d'hydratation
 * (React re-commit synchrone avec le snapshot client avant le premier paint)
 * et SANS setState-in-effect (linter 2026). */
export function useEntryKind(): EntryKind {
  return useSyncExternalStore(subscribeEntry, entrySnapshot, () => null);
}

// ─────────────── Porte console ───────────────

export function ConsoleEntry() {
  const user = useKene((s) => s.user);

  if (user?.role === "admin") return <AdminApp />;

  if (user) {
    // Session NON-admin sur le lien console: orientation claire, aucun
    // indice au-delà de ce que la personne sait déjà (elle est connectée).
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card text-center">
          <div aria-hidden="true" className="kente-band h-1.5 w-full" />
          <div className="space-y-4 px-6 py-8">
            <KeneEmblem size={56} className="mx-auto" />
            <h1 className="font-heading text-xl font-bold">Ce lien ouvre la Console Kènè</h1>
            <p className="text-sm text-muted-foreground">
              Ton compte ({user.name}) vit dans l&apos;app Kènè — clientes, instituts et boutique.
              La console est l&apos;espace d&apos;administration de la plateforme.
            </p>
            <Button asChild className="w-full">
              <a href="/">Ouvrir l&apos;app Kènè</a>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <ConsoleLogin />;
}

/** Session admin ouverte sur la vitrine « / » → redirection vers /console. */
export function ConsoleRedirect() {
  useEffect(() => {
    window.location.replace("/console");
  }, []);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-24 text-center">
      <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">
        La Console Kènè s&apos;ouvre depuis son lien dédié — redirection…
      </p>
    </div>
  );
}

// ─────────────── Connexion console ───────────────

function ConsoleLogin() {
  const setUser = useKene((s) => s.setUser);
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const digits = phone.replace(/\D/g, "");
  const phoneValid = digits.length >= 8;
  const phoneE164 = `+225${digits}`;
  const passkeySupported = typeof window !== "undefined" && browserSupportsWebAuthn();

  function finish(user: ApiUser) {
    rememberAccount({ phone: phoneE164, name: user.name, role: "admin" });
    setUser(user as SessionUser);
    toast.success(`Console ouverte — bienvenue ${user.name.split(" ")[0]} 👑`);
  }

  /** Étape « Continuer »: propose le passkey si un appareil est enregistré,
   * sinon (ou si la cérémonie est annulée/refusée) envoie un code. */
  async function continueWithPhone() {
    if (!phoneValid) return toast.error("Numéro incomplet (8 chiffres min.)");
    setLoading(true);
    try {
      const r = await apiPost<{ passkey: boolean; options?: PublicKeyCredentialRequestOptionsJSON }>(
        "/api/admin/passkey/login/options",
        { phone: phoneE164 },
      );
      if (r.passkey && r.options && passkeySupported) {
        try {
          // Cérémonie WebAuthn: empreinte / Face ID / clé — preuve liée à
          // l'appareil, résistante au hameçonnage (NIST 800-63B-4).
          const assertion = await startAuthentication({ optionsJSON: r.options });
          const v = await apiPost<{ user: ApiUser }>("/api/admin/passkey/login/verify", {
            phone: phoneE164,
            response: assertion,
          });
          finish(v.user);
          return;
        } catch (e) {
          // Cérémonie annulée ou refusée → repli code, sans accabler.
          if (e instanceof ApiError) throw e;
          toast.info("Passkey annulé — connexion par code à 6 chiffres");
        }
      }
      // Flux code: envoi de l'OTP (route pontée — marche même si les POST
      // de la préview sont bloqués).
      await sendCode();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Connexion impossible — réessaie");
    } finally {
      setLoading(false);
    }
  }

  async function sendCode() {
    setSending(true);
    try {
      const res = await apiPost<{ ok: boolean; devCode: string }>("/api/auth/otp/request", { phone: phoneE164 });
      setDevCode(res.devCode ?? "");
      setStep("code");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Envoi impossible");
    } finally {
      setSending(false);
    }
  }

  async function verifyCode(c = code) {
    if (c.length !== 6) return;
    setLoading(true);
    try {
      // contexte « console »: le serveur n'ouvre QUE les comptes admin ici.
      const v = await apiPost<{ user: ApiUser }>("/api/auth/otp/verify", {
        phone: phoneE164,
        code: c,
        context: "console",
      });
      finish(v.user);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Code invalide — réessaie");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div aria-hidden="true" className="kente-band h-1.5 w-full" />
          <div className="space-y-5 px-6 py-8 sm:px-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <KeneEmblem size={64} className="drop-shadow-[0_2px_10px_rgba(200,149,30,0.22)]" />
              <div>
                <h1 className="font-heading text-2xl font-bold tracking-tight">Console Kènè</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pilotage de la plateforme — lien dédié d&apos;administration
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-finance/30 bg-finance/15 px-2.5 py-0.5 text-[11px] font-medium text-finance">
                <ShieldCheck className="size-3" aria-hidden="true" />
                Session sécurisée · 8 h
              </span>
            </div>

            {step === "phone" ? (
              <div className="space-y-3">
                <label htmlFor="console-phone" className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Numéro de la fondatrice
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-mono text-[15px] text-muted-foreground">+225</span>
                  <Input
                    id="console-phone"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="07 00 00 00 00"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    className="h-14 rounded-2xl pl-16 pr-4 font-mono text-base tracking-wider"
                  />
                </div>
                <Button
                  onClick={() => void continueWithPhone()}
                  disabled={loading || !phoneValid}
                  className="h-12 w-full rounded-2xl text-base"
                >
                  {loading ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <ArrowRight className="size-5" aria-hidden="true" />}
                  Continuer
                </Button>
                <p className="flex items-center justify-center gap-1.5 text-center text-[11px] leading-relaxed text-muted-foreground">
                  {passkeySupported ? (
                    <>
                      <Fingerprint className="size-3.5 shrink-0" aria-hidden="true" />
                      Passkey ou code à 6 chiffres — selon les appareils enregistrés
                    </>
                  ) : (
                    <>
                      <Smartphone className="size-3.5 shrink-0" aria-hidden="true" />
                      Code à 6 chiffres envoyé par SMS
                    </>
                  )}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <button
                  onClick={() => { setStep("phone"); setCode(""); setDevCode(""); }}
                  className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  ← Modifier le numéro
                </button>
                <div>
                  <h2 className="font-heading text-lg font-bold">Confirme ton identité</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Saisis les 6 chiffres envoyés au <span className="font-mono">+225{digits}</span>
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-muted/30 p-5">
                  <span id="console-otp-label" className="sr-only">Code à 6 chiffres reçu par SMS</span>
                  <div className="flex justify-center">
                    <InputOTP maxLength={6} value={code} onChange={setCode} autoFocus autoComplete="one-time-code" aria-labelledby="console-otp-label">
                      <InputOTPGroup>
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                          <InputOTPSlot key={i} index={i} />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                </div>
                <Button
                  onClick={() => void verifyCode()}
                  disabled={loading || code.length !== 6}
                  className="h-12 w-full rounded-2xl text-base"
                >
                  {loading ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <KeyRound className="size-5" aria-hidden="true" />}
                  Ouvrir la console
                </Button>
                {devCode && (
                  <div className="rounded-2xl border border-dashed border-primary/50 p-[4px]">
                    <div className="rounded-[18px] bg-card p-3.5 text-center">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Code de vérification</p>
                      <button
                        onClick={() => { setCode(devCode); setTimeout(() => void verifyCode(devCode), 250); }}
                        className="mt-2 font-mono text-2xl font-black tracking-[0.3em] text-primary transition-transform hover:scale-105 active:scale-95"
                        aria-label={`Code reçu ${devCode}, remplir automatiquement`}
                      >
                        {devCode}
                      </button>
                      <p className="mt-1 text-[11px] text-muted-foreground">En mode essai, ton code s&apos;affiche ici — touche-le pour le remplir</p>
                    </div>
                  </div>
                )}
                <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
                  <MessageSquareText className="size-3.5 shrink-0" aria-hidden="true" />
                  Rien reçu ? <button onClick={() => void sendCode()} className="font-semibold text-primary hover:underline">Renvoyer le code</button>
                </p>
              </div>
            )}
          </div>
        </div>
        <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
          Chaque connexion console est journalisée (date, IP) et notifiée sur le compte.
          <br />
          Session administrateur: 8 h — conformité OWASP session à privilèges.
        </p>
      </div>
    </div>
  );
}
