"use client";
// Kènè — Passeport de Peau (, vague 1): la carte du profil qui génère
// le QR partageable. Un jeton stable par cliente (rotation possible = l'ancien
// lien meurt). Partage natif navigator.share, repli copie du lien. Le QR est
// encodé côté client (lib qrcode): modules #1A1410 sur #F8F1E4 — contraste
// maximal, scanable en institut même en plein soleil.
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, QrCode, RotateCcw, Share2 } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";
import { apiPost } from "@/lib/kene/api";
import { RevealItem } from "@/components/kene/ui2026";
import { SectionTitle } from "./bits";

export function PassportCard({ userId }: { userId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const qrBox = useRef<HTMLDivElement>(null);

  const ensure = useCallback(
    async (rotate = false) => {
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
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Passeport indisponible");
      } finally {
        setBusy(false);
      }
    },
    [userId]
  );

  useEffect(() => {
    ensure();
  }, [ensure]);

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

  return (
    <RevealItem>
      <section aria-labelledby="pp-t">
        <SectionTitle icon={<QrCode size={16} />}>
          <span id="pp-t">Passeport de Peau</span>
        </SectionTitle>
        <div className="k-card rounded-[24px] p-4">
          <div className="flex items-start gap-4">
            {/* QR — encart crème scannable (contraste AA + quiet zone) */}
            <div
              ref={qrBox}
              className="shrink-0 rounded-[18px] bg-[#F8F1E4] p-2.5 shadow-inner ring-1 ring-border"
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
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold leading-snug">Ton profil peau, dans la poche des instituts</p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                Scanne ce code en institut partenaire : phototype, type de peau, allergies signalées et ton dernier score
                arrivent en cabine — <strong className="font-semibold text-foreground/80">sans aucune photo</strong>.
              </p>
              {token && (
                <p className="mt-2 font-mono text-[10px] tracking-wider text-muted-foreground/80">{token}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={share}
                  disabled={!url || sharing}
                  className="inline-flex h-11 items-center gap-1.5 rounded-xl k-btn-gold px-4 text-xs font-bold text-primary-foreground disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {sharing ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />} Partager
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
