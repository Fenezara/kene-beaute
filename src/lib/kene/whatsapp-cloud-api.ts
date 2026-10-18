// Kènè — Passerelle Meta WhatsApp Cloud API (Automatisations & Relances)
// Permet la distribution directe de rappels de RDV, relances cabine et suivis
// sans obliger la gérante à cliquer manuellement sur un lien wa.me.

import { formatWhatsAppPhone } from "./whatsapp-relay";

export interface WhatsAppSendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  simulated?: boolean;
}

/**
 * Envoie un message WhatsApp via la Meta WhatsApp Cloud API officielle.
 * Si les variables d'environnement ne sont pas encore définies, le système
 * consigne l'action et bascule gracieusement en mode notification interne / wa.me.
 */
export async function sendWhatsAppCloudMessage(params: {
  toPhone: string;
  message: string;
  previewUrl?: boolean;
}): Promise<WhatsAppSendResult> {
  const token = process.env.WHATSAPP_CLOUD_API_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  const formattedPhone = formatWhatsAppPhone(params.toPhone);
  if (!formattedPhone) {
    return { ok: false, error: "Numéro de téléphone invalide" };
  }

  // Si l'API officielle Meta n'est pas encore configurée sur le serveur
  if (!token || !phoneNumberId) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[WhatsApp Cloud API (Simulé)] Envoi vers ${formattedPhone} : "${params.message.slice(0, 80)}..."`);
    }
    return {
      ok: true,
      simulated: true,
      messageId: `sim_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    };
  }

  try {
    const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: formattedPhone,
      type: "text",
      text: {
        preview_url: Boolean(params.previewUrl),
        body: params.message,
      },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      const errMsg = data?.error?.message || "Erreur Meta WhatsApp Cloud API";
      console.error("[WhatsApp Cloud API Error]:", data?.error);
      return { ok: false, error: errMsg };
    }

    const messageId = data?.messages?.[0]?.id;
    return { ok: true, messageId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[WhatsApp Cloud API Network Error]:", msg);
    return { ok: false, error: msg };
  }
}
