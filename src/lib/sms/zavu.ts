// Kènè — Passerelle SMS & WhatsApp Zavu officielle
// Gère l'envoi en direct de SMS OTP et de messages transactionnels via l'API Zavu (api.zavu.dev).
// - Formatage international E.164 (+225 10 chiffres pour la Côte d'Ivoire, +221 9 chiffres pour le Sénégal)
// - Support multicanal (SMS & WhatsApp)
// - Repli transparent en simulation locale si ZAVU_API_KEY est absent (zéro coupure en dev/tests)

export interface ZavuMessageParams {
  phone: string;
  text: string;
  channel?: "sms_oneway" | "sms" | "whatsapp";
}

export interface ZavuSendResult {
  success: boolean;
  messageId?: string;
  channel?: "sms_oneway" | "sms" | "whatsapp";
  simulated: boolean;
  error?: string;
}

/**
 * Normalise un numéro au standard international E.164 (avec le '+' initial requis par Zavu).
 * Ex: 0701020304 -> +2250701020304
 * Ex: +225 05 04 19 50 71 -> +2250504195071
 * Ex: 77 123 45 67 -> +221771234567
 */
export function formatE164Phone(rawPhone: string): string {
  const digits = rawPhone.replace(/[^\d+]/g, "").trim();

  // Si déjà en E.164 complet (+225... ou +221...)
  if (digits.startsWith("+")) {
    return digits;
  }

  // Si indicatif présent sans le '+'
  if (digits.startsWith("225") && digits.length === 13) {
    return `+${digits}`;
  }
  if (digits.startsWith("221") && digits.length === 12) {
    return `+${digits}`;
  }

  // Format local ivoirien (10 chiffres commençant par 01, 05, 07)
  if (/^0[157]\d{8}$/.test(digits)) {
    return `+225${digits}`;
  }

  // Format local sénégalais (9 chiffres commençant par 7)
  if (/^7[0-8]\d{7}$/.test(digits)) {
    return `+221${digits}`;
  }

  // Fallback : préfixe '+' si non vide
  return digits ? `+${digits}` : "";
}

/**
 * Envoie un message SMS ou WhatsApp via la passerelle Zavu.
 */
export async function sendZavuMessage({
  phone,
  text,
  channel = "sms_oneway",
}: ZavuMessageParams): Promise<ZavuSendResult> {
  const apiKey = process.env.ZAVU_API_KEY?.trim();
  const e164Phone = formatE164Phone(phone);

  if (!apiKey) {
    console.log(`[Zavu Simulation] Canal: ${channel.toUpperCase()} | To: ${e164Phone} | Text: "${text}"`);
    return {
      success: true,
      simulated: true,
      channel,
      messageId: `sim_zv_${Date.now()}`,
    };
  }

  // Si "sms" est demandé, Zavu requiert "sms_oneway" pour les expéditeurs à sens unique
  const targetChannel = channel === "sms" ? "sms_oneway" : channel;

  try {
    const res = await fetch("https://api.zavu.dev/v1/messages", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: e164Phone,
        text,
        channel: targetChannel,
      }),
      signal: AbortSignal.timeout(8000), // Timeout de 8 secondes
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[Zavu Error] Statut ${res.status}: ${errorText}`);
      return {
        success: false,
        simulated: false,
        channel: targetChannel,
        error: `Erreur API Zavu (${res.status}): ${errorText.slice(0, 120)}`,
      };
    }

    const data = (await res.json()) as { id?: string; messageId?: string; status?: string; message?: { id?: string } };
    const messageId = data.message?.id || data.id || data.messageId || `zv_${Date.now()}`;

    return {
      success: true,
      simulated: false,
      channel: targetChannel,
      messageId,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Zavu Exception] Échec d'envoi à ${e164Phone}:`, msg);
    return {
      success: false,
      simulated: false,
      channel: targetChannel,
      error: msg,
    };
  }
}

/**
 * Envoie spécifiquement un code OTP de validation par SMS via Zavu (canal sms_oneway).
 */
export async function sendZavuOtpSms(
  phone: string,
  code: string,
  expiresInMin = 5,
): Promise<ZavuSendResult> {
  const text = `Kènè : Ton code de validation est : ${code} (valable ${expiresInMin} min). Ne le partage à personne.`;
  return sendZavuMessage({
    phone,
    text,
    channel: "sms_oneway",
  });
}
