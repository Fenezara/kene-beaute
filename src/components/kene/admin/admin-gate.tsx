"use client";
// Kènè — AdminGate: step-up console (t. 130, ASVS V2.7).
//
// Les actions SENSIBLES de la console (suspendre/réactiver un institut,
// piloter commission/plan, verrouiller un compte, gérer les passkeys)
// traversent ce provider: si le serveur répond 403 `elevation_required`,
// le dialogue « Confirme ton identité » s'ouvre UNE fois (code à 6 chiffres
// frais → cookie d'élévation 5 min) puis l'action interrompue est REJOUÉE
// telle quelle. Dans la fenêtre de 5 min, les actions suivantes passent
// sans nouvelle confirmation — le rythme d'une session de pilotage.
//
// Contrat exposé aux sections (useAdminGate):
// • elevatedPatch(url, body) / elevatedPost(url, body) / elevatedDelete(url)
//   — mêmes signatures que apiPatch/apiPost/apiDelete + replay automatique;
// • stepUp() — force le dialogue (bouton « Enregistrer un appareil »).
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Loader2, MessageSquareText, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiPatch, apiPost, ApiError } from "@/lib/kene/api";
import { useKene } from "@/store/kene";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

type PendingRequest = {
  method: "PATCH" | "POST" | "DELETE";
  url: string;
  body?: unknown;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
};

type AdminGate = {
  elevatedPatch: <T>(url: string, body?: unknown) => Promise<T>;
  elevatedPost: <T>(url: string, body?: unknown) => Promise<T>;
  elevatedDelete: <T>(url: string) => Promise<T>;
  /** Ouvre le dialogue de confirmation (sans action en attente). */
  stepUp: () => Promise<void>;
};

const AdminGateContext = createContext<AdminGate | null>(null);

export function useAdminGate(): AdminGate {
  const ctx = useContext(AdminGateContext);
  if (!ctx) throw new Error("useAdminGate exige <AdminGateProvider> (shell AdminApp)");
  return ctx;
}

/** Envoi brut selon la méthode. */
async function rawSend<T>(method: PendingRequest["method"], url: string, body?: unknown): Promise<T> {
  if (method === "PATCH") return apiPatch<T>(url, body);
  if (method === "POST") return apiPost<T>(url, body);
  return apiDelete<T>(url);
}

export function AdminGateProvider({ children }: { children: ReactNode }) {
  const user = useKene((s) => s.user);
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [phase, setPhase] = useState<"intro" | "code">("intro");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  // Requête « stepUp() » isolée (sans action à rejouer).
  const plainStepUp = useRef<((v: void) => void) | null>(null);

  const digits = (user?.phone ?? "").replace(/\D/g, "");
  const maskedPhone = digits.length >= 4 ? `+225 ${digits.slice(0, 2)}••••${digits.slice(-2)}` : "+225 …";

  const openDialog = useCallback((req: PendingRequest | null) => {
    if (req) setPending(req);
    setPhase("intro");
    setCode("");
    setDevCode("");
    setStepUpOpen(true);
  }, []);

  const request = useCallback(
    async <T,>(method: PendingRequest["method"], url: string, body?: unknown): Promise<T> => {
      try {
        return await rawSend<T>(method, url, body);
      } catch (e) {
        if (e instanceof ApiError && e.code === "elevation_required") {
          return new Promise<T>((resolve, reject) => {
            openDialog({ method, url, body, resolve: resolve as (v: unknown) => void, reject });
          });
        }
        throw e;
      }
    },
    [openDialog],
  );

  const elevatedPatch = useCallback(<T,>(url: string, body?: unknown) => request<T>("PATCH", url, body), [request]);
  const elevatedPost = useCallback(<T,>(url: string, body?: unknown) => request<T>("POST", url, body), [request]);
  const elevatedDelete = useCallback(<T,>(url: string) => request<T>("DELETE", url), [request]);
  const stepUp = useCallback(
    () =>
      new Promise<void>((resolve) => {
        plainStepUp.current = resolve;
        openDialog(null);
      }),
    [openDialog],
  );

  const closeDialog = useCallback(
    (cancelled: boolean) => {
      if (cancelled) {
        pending?.reject(new ApiError("Confirmation d'identité annulée", 0));
        plainStepUp.current?.();
      } else {
        plainStepUp.current?.();
      }
      plainStepUp.current = null;
      setPending(null);
      setStepUpOpen(false);
    },
    [pending],
  );

  /** « Envoyer le code »: OTP au numéro de la session (route pontée). */
  async function sendCode() {
    if (!user?.phone) return;
    setSending(true);
    try {
      const res = await apiPost<{ ok: boolean; devCode: string }>("/api/auth/otp/request", { phone: user.phone });
      setDevCode(res.devCode ?? "");
      setPhase("code");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Envoi impossible");
    } finally {
      setSending(false);
    }
  }

  /** « Confirmer »: élévation (cookie 5 min) puis REJEU de l'action. */
  async function confirmCode(c = code) {
    if (c.length !== 6) return;
    setBusy(true);
    try {
      await apiPost<{ ok: true }>("/api/admin/elevate", { code: c });
      toast.success("Identité confirmée — 5 minutes");
      const req = pending;
      setPending(null);
      setStepUpOpen(false);
      plainStepUp.current?.();
      plainStepUp.current = null;
      if (req) {
        try {
          req.resolve(await rawSend(req.method, req.url, req.body));
        } catch (e) {
          req.reject(e);
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Code invalide — réessaie");
    } finally {
      setBusy(false);
    }
  }

  const value = useMemo<AdminGate>(
    () => ({ elevatedPatch, elevatedPost, elevatedDelete, stepUp }),
    [elevatedPatch, elevatedPost, elevatedDelete, stepUp],
  );

  return (
    <AdminGateContext.Provider value={value}>
      {children}

      {/* — Dialogue de confirmation d'identité (step-up) — */}
      <Dialog
        open={stepUpOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog(true);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading">
              <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
              Confirme ton identité
            </DialogTitle>
            <DialogDescription>
              {phase === "intro"
                ? "Cette action de gestion exige une preuve d'identité fraîche — un code à 6 chiffres envoyé au "
                : "Saisis les 6 chiffres envoyés au "}
              <span className="font-mono font-semibold text-foreground">{maskedPhone}</span>. Valable 5 minutes.
            </DialogDescription>
          </DialogHeader>

          {phase === "intro" ? (
            <div className="space-y-3">
              <p className="rounded-xl bg-muted/40 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
                Suspension d&apos;institut, verrouillage de compte, commission, plan, passkeys — chaque geste sensible
                de la console demande une confirmation d&apos;identité récente.
              </p>
              <Button onClick={() => void sendCode()} disabled={sending} className="w-full">
                {sending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <MessageSquareText className="size-4" aria-hidden="true" />}
                Envoyer le code
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-center rounded-xl border border-border/60 bg-muted/30 p-4">
                <span id="gate-otp-label" className="sr-only">Code à 6 chiffres reçu par SMS</span>
                <InputOTP maxLength={6} value={code} onChange={setCode} autoFocus autoComplete="one-time-code" aria-labelledby="gate-otp-label">
                  <InputOTPGroup>
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              {devCode && (
                <div className="rounded-xl border border-dashed border-primary/50 p-[3px]">
                  <div className="rounded-lg bg-card p-3 text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Code de vérification</p>
                    <button
                      onClick={() => { setCode(devCode); setTimeout(() => void confirmCode(devCode), 200); }}
                      className="mt-1 font-mono text-xl font-black tracking-[0.3em] text-primary transition-transform hover:scale-105 active:scale-95"
                      aria-label={`Code reçu ${devCode}, remplir automatiquement`}
                    >
                      {devCode}
                    </button>
                    <p className="text-[10px] text-muted-foreground">En mode essai, ton code s&apos;affiche ici</p>
                  </div>
                </div>
              )}
              <DialogFooter className="flex-col gap-2 sm:flex-col">
                <Button onClick={() => void confirmCode()} disabled={busy || code.length !== 6} className="w-full">
                  {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="size-4" aria-hidden="true" />}
                  Confirmer et continuer
                </Button>
                <Button variant="ghost" onClick={() => void sendCode()} disabled={sending} className="w-full text-xs">
                  Renvoyer le code
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminGateContext.Provider>
  );
}
