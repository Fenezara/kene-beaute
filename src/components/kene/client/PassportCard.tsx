"use client";
// Kènè — Passeport de Peau (, vague 1): la carte du profil qui génère
// le QR partageable. Un jeton stable par cliente (rotation possible = l'ancien
// lien meurt). Partage natif navigator.share, repli copie du lien. Le QR est
// encodé côté client (lib qrcode): modules #1A1410 sur #F8F1E4 — contraste
// maximal, scanable en institut même en plein soleil.
import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, Loader2, MessageCircle, QrCode, RotateCcw, Share2, Lock, Sparkles, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";
import { apiPost } from "@/lib/kene/api";
import { RevealItem } from "@/components/kene/ui2026";
import { openWhatsApp, buildWhatsAppPassportMessage } from "@/lib/kene/whatsapp-relay";
import { useKene, isSavedUser } from "@/store/kene";
import { SectionTitle } from "./bits";

export function PassportCard({ userId }: { userId: string }) {
  const user = useKene((s) => s.user);
  const isGuest = !isSavedUser(user);

  const [token, setToken] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const qrBox = useRef<HTMLDivElement>(null);

  const ensure = useCallback(
    async (rotate = false) => {
      if (isGuest) return;
      setBusy(true);
      try {
        const r = await apiPost<{ token: string; path: string }>("/api/passport", rotate ? { userId, rotate: true } : { userId });
        setToken(r.token);
        // path = "/?passport=<token>" (relatif, jamais de port en dur) → absolu
        // reconstruit sur l'origine RÉELLE vue par le navigateur (gateway:81
        // en E2E, domaine public en prod).
        const abs = `${window.location.origin}${r.path.startsWith("/") ? r.path : `/${r.path}`}`;
        setUrl(abs);
        // QR: marge généreuse (quiet zone), correction M — scanable même si
        // l'écran est fissuré ou la capture penche.
        const dataUrl = await QRCode.toDataURL(abs, {
          margin: 2,
          width: 460,
          errorCorrectionLevel: "M",
          color: { dark: "#1A1410", light: "#F8F1E4" },
        });
        setQr(dataUrl);

        // Sauvegarde résilience hors-ligne (PWA): le QR reste affichable sans réseau
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem(`kene_passport_${userId}`, JSON.stringify({ token: r.token, url: abs, qr: dataUrl }));
          } catch {}
        }
      } catch (e) {
        // Si erreur réseau mais déjà en cache, pas d'alerte agressive
        if (!qr) {
          toast.error(e instanceof Error ? e.message : "Passeport indisponible");
        }
      } finally {
        setBusy(false);
      }
    },
    [userId, qr]
  );

  useEffect(() => {
    // Restauration immédiate depuis le cache local (affichage instantané en cabine)
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem(`kene_passport_${userId}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.token) setToken(parsed.token);
          if (parsed.url) setUrl(parsed.url);
          if (parsed.qr) setQr(parsed.qr);
        }
      } catch {}
    }
    ensure();
  }, [userId, ensure]);

  async function share() {
    if (!url) return;
    setSharing(true);
    try {
      const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
      if (nav.share) {
        await nav.share({
          title: "Mon Passeport de Peau — Kènè",
          text: "Voici mon profil peau Kènè pour mon prochain soin en institut.",
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Lien du passeport copié", { description: "Colle-le où tu veux — WhatsApp, e-mail…" });
      }
    } catch {
      // annulation du partage natif — pas une erreur
    } finally {
      setSharing(false);
    }
  }

  if (isGuest) {
    return (
      <RevealItem>
        <section aria-labelledby="pp-t">
          <SectionTitle icon={<QrCode size={16} />}>
            <span id="pp-t">Passeport de Peau</span>
          </SectionTitle>
          <div className="k-solar-glass relative overflow-hidden rounded-[24px] p-4.5 sm:p-5 border border-gold/40">
            <div
              aria-hidden="true"
              className="k-aura-glow absolute -top-12 -right-12 h-40 w-40 rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(212,154,36,0.45) 0%, rgba(158,32,69,0.2) 55%, transparent 75%)",
              }}
            />
            <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-start gap-4">
              {/* QR flouté avec cadenas doré */}
              <div
                className="relative shrink-0 rounded-[18px] bg-[#F8F1E4] p-2.5 shadow-inner ring-1 ring-border mx-auto sm:mx-0 flex items-center justify-center overflow-hidden h-[132px] w-[132px]"
                aria-label="Passeport verrouillé"
              >
                <div className="absolute inset-0 bg-[#1A1410]/20 backdrop-blur-[3px] flex flex-col items-center justify-center gap-1.5 p-2 text-center">
                  <div className="h-9 w-9 rounded-full bg-gold text-black flex items-center justify-center shadow-md">
                    <Lock size={17} />
                  </div>
                  <span className="text-[10px] font-black uppercase text-foreground tracking-wider bg-card/80 px-2 py-0.5 rounded-full">
                    Mode Invité
                  </span>
                </div>
                <QrCode size={90} className="text-[#1A1410]/20" />
              </div>

              <div className="min-w-0 flex-1 text-center sm:text-left">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 border border-gold/40 px-2.5 py-0.5 text-[10.5px] font-black uppercase tracking-wider text-gold-text">
                    <Sparkles size={11} />
                    Passeport Provisoire
                  </span>
                </div>
                <h3 className="mt-1.5 text-sm sm:text-[15px] font-bold text-foreground">
                  Officialisez votre Passeport Cutané
                </h3>
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                  Le QR Code officiel reconnu en institut et vos ordonnances WhatsApp permanentes nécessitent un compte enregistré. Sauvegardez gratuitement vos résultats à vie.
                </p>

                <div className="mt-3.5 flex flex-wrap justify-center sm:justify-start gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        window.dispatchEvent(new CustomEvent("kene:open-link-account"));
                      }
                    }}
                    className="inline-flex h-11 items-center gap-2 rounded-xl k-btn-gold px-4.5 text-xs font-black text-primary-foreground shadow-md transition-all hover:scale-105 active:scale-95 cursor-pointer"
                  >
                    <Sparkles size={15} />
                    <span>Créer mon compte gratuit (0 FCFA)</span>
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-3.5 pt-2.5 border-t border-border/60 flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <ShieldCheck size={13} className="text-emerald-500 shrink-0" /> 100% Gratuit &amp; Sans carte bancaire
              </span>
              <span>Reconnu en cabine LA DERMO &amp; instituts partenaires</span>
            </div>
          </div>
        </section>
      </RevealItem>
    );
  }

  return (
    <RevealItem>
      <section aria-labelledby="pp-t">
        <SectionTitle icon={<QrCode size={16} />}>
          <span id="pp-t">Passeport de Peau</span>
        </SectionTitle>
        <div className="k-solar-glass relative overflow-hidden rounded-[24px] p-4">
          <div
            aria-hidden="true"
            className="k-aura-glow absolute -top-12 -right-12 h-40 w-40 rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(212,154,36,0.58) 0%, rgba(158,32,69,0.25) 55%, transparent 75%)",
            }}
          />
          <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-start gap-4">
            {/* QR — encart crème scannable (contraste AA + quiet zone) */}
            <div
              ref={qrBox}
              className="shrink-0 rounded-[18px] bg-[#F8F1E4] p-2.5 shadow-inner ring-1 ring-border mx-auto sm:mx-0"
              aria-label={token ? `QR de ton passeport — jeton ${token}` : "QR en préparation"}
            >
              {qr ? (
                <img src={qr} alt={`QR code de ton Passeport de Peau (jeton ${token})`} className="h-[132px] w-[132px]" width={132} height={132} />
              ) : (
                <span className="grid h-[132px] w-[132px] place-items-center text-[#1A1410]/50">
                  {busy ? <Loader2 size={22} className="animate-spin" /> : <QrCode size={26} />}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <p className="text-[13px] font-semibold leading-snug">Ton profil peau, dans la poche des instituts</p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                Scanne ce code en institut partenaire : phototype, type de peau, allergies signalées et ton dernier score
                arrivent en cabine — <strong className="font-semibold text-foreground/80">sans aucune photo</strong>.
              </p>
              {token && (
                <p className="mt-2 font-mono text-[10px] tracking-wider text-muted-foreground/80">{token}</p>
              )}
              <div className="mt-3 flex flex-wrap justify-center sm:justify-start gap-2">
                <button
                  onClick={share}
                  disabled={!url || sharing}
                  className="inline-flex h-11 items-center gap-1.5 rounded-xl k-btn-gold px-4 text-xs font-bold text-primary-foreground disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {sharing ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />} Partager
                </button>
                <button
                  onClick={() => {
                    if (!url) return;
                    const msg = buildWhatsAppPassportMessage({ passportUrl: url });
                    openWhatsApp("", msg);
                  }}
                  disabled={!url}
                  className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white px-3.5 text-xs font-bold shadow-sm transition active:scale-95 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-[#25D366]"
                  title="Partager directement via WhatsApp"
                >
                  <MessageCircle size={14} /> WhatsApp
                </button>
                <button
                  onClick={() => {
                    if (!token || typeof window === "undefined") return;
                    window.history.pushState(null, "", `/?passport=${encodeURIComponent(token)}`);
                    window.dispatchEvent(new PopStateEvent("popstate"));
                  }}
                  disabled={!token}
                  className="inline-flex h-11 items-center gap-1.5 rounded-xl k-chip px-3.5 text-xs font-bold text-foreground hover:bg-accent/70 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-primary"
                  title="Aperçu en direct de mon Passeport de Peau"
                >
                  <Eye size={14} /> Aperçu
                </button>
                <button
                  onClick={() => ensure(true)}
                  disabled={busy}
                  className="inline-flex h-11 items-center gap-1.5 rounded-xl k-chip px-3.5 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-primary"
                  aria-label="Régénérer mon QR — l'ancien lien devient invalide"
                >
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Régénérer
                </button>
              </div>
            </div>
          </div>
          <p className="mt-3 border-t border-dashed border-border pt-2.5 text-[10px] leading-relaxed text-muted-foreground">
            « Régénérer » révoque l&apos;ancien code : un lien partagé par erreur cesse de fonctionner immédiatement.
          </p>
        </div>
      </section>
    </RevealItem>
  );
}
