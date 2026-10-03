// Kènè — Passerelle de paiement Wave Mobile Money (Côte d'Ivoire & Sénégal)
// Gère l'intégration officielle Wave Checkout API :
// 1. Création de session de paiement (retourne le lien wave_launch_url)
// 2. Vérification cryptographique des webhooks Wave (HMAC SHA-256)
// 3. Mode hybride transparent : bascule automatique en simulation si WAVE_API_KEY est absent.

import crypto from "crypto";

export interface CreateWaveSessionParams {
  paymentId: string;
  amount: number; // en Francs CFA (XOF)
  currency?: "XOF";
  description?: string;
  successUrl?: string;
  errorUrl?: string;
}

export interface WaveSessionResult {
  id: string;
  waveLaunchUrl: string | null;
  mode: "live" | "simulation";
  rawStatus?: string;
}

const WAVE_API_BASE = process.env.WAVE_API_BASE ?? "https://api.wave.com/v1";

/**
 * Crée une session de checkout Wave.
 * Si WAVE_API_KEY n'est pas définie dans l'environnement, bascule en simulation sécurisée.
 */
export async function createWaveCheckoutSession(params: CreateWaveSessionParams): Promise<WaveSessionResult> {
  const apiKey = process.env.WAVE_API_KEY?.trim();
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

  const defaultSuccessUrl = `${appUrl}/?payment_status=success&paymentId=${encodeURIComponent(params.paymentId)}`;
  const defaultErrorUrl = `${appUrl}/?payment_status=cancelled&paymentId=${encodeURIComponent(params.paymentId)}`;

  const successUrl = params.successUrl ?? defaultSuccessUrl;
  const errorUrl = params.errorUrl ?? defaultErrorUrl;

  // Mode simulation si aucune clé renseignée
  if (!apiKey) {
    return {
      id: `wave_sim_${params.paymentId}`,
      waveLaunchUrl: null,
      mode: "simulation",
      rawStatus: "simulated",
    };
  }

  try {
    const res = await fetch(`${WAVE_API_BASE}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: String(Math.round(params.amount)),
        currency: params.currency ?? "XOF",
        client_reference: params.paymentId,
        error_url: errorUrl,
        success_url: successUrl,
        restricted: false,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[Wave API Error] HTTP ${res.status}:`, errorText);
      throw new Error(`Wave API Error: ${res.statusText}`);
    }

    const data = (await res.json()) as {
      id: string;
      wave_launch_url?: string;
      checkout_status?: string;
    };

    return {
      id: data.id,
      waveLaunchUrl: data.wave_launch_url ?? null,
      mode: "live",
      rawStatus: data.checkout_status,
    };
  } catch (err) {
    console.error("[Wave Checkout] Échec de création de session, repli simulation:", err);
    return {
      id: `wave_sim_fallback_${params.paymentId}`,
      waveLaunchUrl: null,
      mode: "simulation",
      rawStatus: "fallback",
    };
  }
}

/**
 * Vérifie l'authenticité d'un webhook Wave entrant à l'aide du secret partagé.
 * Wave envoie l'en-tête 'Wave-Signature' contenant: 't=<timestamp>,v1=<signature_hmac_hex>'
 * ou directement la signature hex selon les versions de webhook.
 */
export function verifyWaveSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string | null | undefined
): boolean {
  if (!secret) return false;
  if (!signatureHeader) return false;

  try {
    let expectedHash: string;
    let actualHash: string = signatureHeader.trim();

    // Format t=timestamp,v1=signature
    if (signatureHeader.includes("t=") && signatureHeader.includes("v1=")) {
      const parts = signatureHeader.split(",").reduce((acc, part) => {
        const [k, v] = part.split("=");
        if (k && v) acc[k.trim()] = v.trim();
        return acc;
      }, {} as Record<string, string>);

      const timestamp = parts["t"];
      const v1 = parts["v1"];
      if (!timestamp || !v1) return false;

      // Anti-replay (10 minutes)
      const ts = parseInt(timestamp, 10);
      if (Number.isFinite(ts)) {
        const diffMs = Math.abs(Date.now() - ts * 1000);
        if (diffMs > 10 * 60 * 1000) return false;
      }

      const payloadToSign = `${timestamp}.${rawBody}`;
      expectedHash = crypto.createHmac("sha256", secret).update(payloadToSign).digest("hex");
      actualHash = v1;
    } else {
      expectedHash = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    }

    const expectedBuffer = Buffer.from(expectedHash, "hex");
    const actualBuffer = Buffer.from(actualHash, "hex");

    if (expectedBuffer.length !== actualBuffer.length) return false;
    return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  } catch (e) {
    console.error("[Wave Webhook] Erreur de vérification signature:", e);
    return false;
  }
}
