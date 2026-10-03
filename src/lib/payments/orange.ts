// Kènè — Passerelle Orange Money Web Payment (Côte d'Ivoire & Sénégal)
// Supporte l'initiation de paiement en ligne Orange Money et les webhooks de confirmation.
// Repli automatique et transparent en mode simulation si les clés ORANGE_MONEY_* ne sont pas définies.

export interface CreateOrangeCheckoutParams {
  paymentId: string;
  amount: number;
  currency?: string;
  description?: string;
  returnUrl?: string;
  cancelUrl?: string;
  phone?: string;
}

export interface OrangeCheckoutResult {
  id: string;
  mode: "live" | "simulation";
  omLaunchUrl: string | null;
  error?: string;
}

export async function createOrangeCheckoutSession({
  paymentId,
  amount,
  currency = "XOF",
  description = "Achat Kènè",
  returnUrl,
  cancelUrl,
  phone,
}: CreateOrangeCheckoutParams): Promise<OrangeCheckoutResult> {
  const clientId = process.env.ORANGE_MONEY_CLIENT_ID?.trim();
  const clientSecret = process.env.ORANGE_MONEY_CLIENT_SECRET?.trim();
  const merchantKey = process.env.ORANGE_MONEY_MERCHANT_KEY?.trim();

  // Mode simulation si les identifiants marchands ne sont pas renseignés
  if (!clientId || !clientSecret || !merchantKey) {
    console.log(
      `[Orange Money · Simulation] Session créée pour paymentId: ${paymentId} | Montant: ${amount} ${currency}`
    );
    return {
      id: `om_sim_${paymentId}`,
      mode: "simulation",
      omLaunchUrl: null,
    };
  }

  try {
    // 1. Récupération du jeton OAuth2 Orange Developer
    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenRes = await fetch("https://api.orange.com/oauth/v3/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${authHeader}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(10000),
    });

    if (!tokenRes.ok) {
      console.error("[Orange Money OAuth Error] HTTP", tokenRes.status);
      return {
        id: `om_err_${paymentId}`,
        mode: "simulation",
        omLaunchUrl: null,
        error: "Erreur authentification Orange Money",
      };
    }

    const tokenData = (await tokenRes.json()) as { access_token?: string };
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return {
        id: `om_err_${paymentId}`,
        mode: "simulation",
        omLaunchUrl: null,
        error: "Token Orange Money introuvable",
      };
    }

    // 2. Initialisation du Web Payment
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const payRes = await fetch("https://api.orange.com/orange-money-webpay/dev/v1/webpayment", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        merchant_key: merchantKey,
        currency,
        order_id: paymentId,
        amount,
        return_url: returnUrl ?? `${appUrl}/api/payments/orange/return?paymentId=${paymentId}`,
        cancel_url: cancelUrl ?? `${appUrl}/api/payments/orange/cancel?paymentId=${paymentId}`,
        notif_url: `${appUrl}/api/payments/orange/webhook`,
        lang: "fr",
        reference: `KENE-${paymentId.slice(-6).toUpperCase()}`,
      }),
      signal: AbortSignal.timeout(10000),
    });

    const payData = (await payRes.json().catch(() => null)) as {
      payment_url?: string;
      pay_token?: string;
      message?: string;
    } | null;

    if (!payRes.ok || !payData?.payment_url) {
      console.error("[Orange Money Payment Error] HTTP", payRes.status, payData?.message);
      return {
        id: `om_err_${paymentId}`,
        mode: "simulation",
        omLaunchUrl: null,
        error: payData?.message || "Erreur initialisation session Orange Money",
      };
    }

    return {
      id: payData.pay_token || `om_${paymentId}`,
      mode: "live",
      omLaunchUrl: payData.payment_url,
    };
  } catch (err: any) {
    console.error("[Orange Money Exception] Erreur réseau:", err?.message || err);
    return {
      id: `om_err_${paymentId}`,
      mode: "simulation",
      omLaunchUrl: null,
      error: err?.message || "Erreur réseau Orange Money",
    };
  }
}
