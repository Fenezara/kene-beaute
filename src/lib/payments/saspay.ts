// Kènè — Passerelle de paiement SasPay officielle (Côte d'Ivoire & Afrique francophone)
// Documentation : https://saspay.me/docs/
// 1. Initialisation de sessions de paiement (Checkout Sessions) : https://api.saspay.me/api/v1/checkout-sessions/
// 2. Vérification des transactions et réconciliation
// 3. Traitement des webhooks de notification
// 4. Repli transparent en simulation si clé non configurée (sécurité dev/staging)

export interface CreateSaspaySessionParams {
  paymentId: string;
  amount: number; // Montant en FCFA (XOF)
  description: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  returnUrl?: string;
  cancelUrl?: string;
}

export interface SaspaySessionResult {
  id: string;
  checkoutUrl: string | null;
  mode: "live" | "simulation";
  rawStatus?: string;
  error?: string;
}

export interface SaspayVerifyResult {
  success: boolean;
  isPaid: boolean;
  status: "completed" | "pending" | "failed" | "cancelled";
  amount: number;
  paymentId?: string;
  paymentMethod?: string;
  raw?: unknown;
}

const SASPAY_API_BASE = process.env.SASPAY_API_BASE ?? "https://api.saspay.me";

/**
 * Initialise une session de paiement SasPay.
 * Si SASPAY_API_KEY est absente, bascule proprement en simulation.
 */
export async function createSaspayCheckoutSession(
  params: CreateSaspaySessionParams
): Promise<SaspaySessionResult> {
  let apiKey = process.env.SASPAY_API_KEY?.trim();
  if (apiKey && apiKey.toLowerCase().endsWith("saspay") && apiKey.length > 51) {
    apiKey = apiKey.slice(0, -6).trim();
  }
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

  const defaultReturnUrl = `${appUrl}/?payment_status=success&paymentId=${encodeURIComponent(params.paymentId)}&provider=saspay`;
  const defaultCancelUrl = `${appUrl}/?payment_status=cancelled&paymentId=${encodeURIComponent(params.paymentId)}&provider=saspay`;

  const returnUrl = params.returnUrl ?? defaultReturnUrl;
  const cancelUrl = params.cancelUrl ?? defaultCancelUrl;

  // Repli sécurisé en simulation locale si clé non configurée
  if (!apiKey) {
    console.log(`[SasPay Simulation] Création session: ${params.paymentId} | Montant: ${params.amount} FCFA | "${params.description}"`);
    return {
      id: `sas_sim_${params.paymentId}`,
      checkoutUrl: `${returnUrl}&simulated=1`,
      mode: "simulation",
      rawStatus: "simulated",
    };
  }

  try {
    const res = await fetch(`${SASPAY_API_BASE}/api/v1/checkout-sessions/`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Idempotency-Key": params.paymentId,
      },
      body: JSON.stringify({
        amount: String(Math.round(params.amount)),
        currency: "XOF",
        description: params.description,
        customer_email: params.customerEmail?.trim() || "client@kene-beaute.com",
        customer_name: params.customerName?.trim() || "Cliente Kènè",
        return_url: returnUrl,
        cancel_url: cancelUrl,
      }),
      signal: AbortSignal.timeout(12000),
    });

    const payload = (await res.json().catch(() => ({}))) as Record<string, any>;
    const data = (payload.data && typeof payload.data === "object" ? payload.data : payload) as Record<string, any>;

    if (!res.ok || payload.success === false) {
      const errMsg =
        data?.error?.detail ||
        payload?.error?.detail ||
        data?.error ||
        data?.message ||
        payload?.message ||
        res.statusText;
      console.error(`[SasPay API Error] HTTP ${res.status}:`, errMsg);
      return {
        id: `sas_err_${params.paymentId}`,
        checkoutUrl: null,
        mode: apiKey.startsWith("sk_live") ? "live" : "simulation",
        error: typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg),
      };
    }

    const checkoutUrl = data.checkout_url || payload.checkout_url || data.payment_url || null;
    const sessionId = String(data.id || payload.id || params.paymentId);

    return {
      id: sessionId,
      checkoutUrl,
      mode: apiKey.startsWith("sk_live") ? "live" : "simulation",
      rawStatus: data.status || payload.status || "created",
    };
  } catch (err: any) {
    console.error("[SasPay Exception] Échec lors de la création de session:", err?.message || err);
    return {
      id: `sas_err_${params.paymentId}`,
      checkoutUrl: null,
      mode: apiKey.startsWith("sk_live") ? "live" : "simulation",
      error: err?.message || "Erreur de connexion SasPay",
    };
  }
}

/**
 * Vérifie l'état d'un paiement SasPay auprès de l'API.
 */
export async function verifySaspayPayment(
  sessionIdOrPaymentId: string
): Promise<SaspayVerifyResult> {
  let apiKey = process.env.SASPAY_API_KEY?.trim();
  if (apiKey && apiKey.toLowerCase().endsWith("saspay") && apiKey.length > 51) {
    apiKey = apiKey.slice(0, -6).trim();
  }

  // Mode simulation
  if (!apiKey || sessionIdOrPaymentId.startsWith("sas_sim_")) {
    return {
      success: true,
      isPaid: true,
      status: "completed",
      amount: 0,
      paymentId: sessionIdOrPaymentId.replace(/^sas_sim_/, ""),
      paymentMethod: "Simulation",
    };
  }

  try {
    // 1. Consultation prioritaire du checkout-session
    const sessionRes = await fetch(`${SASPAY_API_BASE}/api/v1/checkout-sessions/${encodeURIComponent(sessionIdOrPaymentId)}/`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (sessionRes.ok) {
      const sPayload = (await sessionRes.json().catch(() => ({}))) as Record<string, any>;
      const sData = (sPayload.data && typeof sPayload.data === "object" ? sPayload.data : sPayload) as Record<string, any>;
      const rawStat = String(sData.status || sData.payment_status || "").toUpperCase();
      const isPaid = ["COMPLETED", "PAID", "SUCCESS", "SUCCEEDED"].includes(rawStat) || Boolean(sData.paid_at);

      return {
        success: true,
        isPaid,
        status: isPaid ? "completed" : rawStat === "CANCELLED" ? "cancelled" : rawStat === "FAILED" ? "failed" : "pending",
        amount: Number(sData.amount || 0),
        paymentMethod: sData.network || sData.payment_method || "SasPay",
        raw: sData,
      };
    }

    // 2. Repli secondaire sur payments/:id/verify
    const res = await fetch(`${SASPAY_API_BASE}/api/v1/payments/${encodeURIComponent(sessionIdOrPaymentId)}/verify/`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as Record<string, any>;
      const rawStat = String(data.status || data.state || "").toLowerCase();
      const isPaid = ["completed", "paid", "success", "succeeded"].includes(rawStat);

      return {
        success: true,
        isPaid,
        status: isPaid ? "completed" : rawStat === "cancelled" ? "cancelled" : rawStat === "failed" ? "failed" : "pending",
        amount: Number(data.amount || 0),
        paymentMethod: data.network || data.payment_method || "SasPay",
        raw: data,
      };
    }

    return {
      success: false,
      isPaid: false,
      status: "pending",
      amount: 0,
      raw: null,
    };
  } catch (err: any) {
    console.error("[SasPay Verify Exception]:", err?.message || err);
    return {
      success: false,
      isPaid: false,
      status: "pending",
      amount: 0,
    };
  }
}
