// Kènè — Passerelle SMS & Messagerie Unifiée (Africa API & Ouest-Africaine)
// Orchestre l'envoi de SMS OTP et de notifications transactionnelles avec bascule automatique :
// 1. Africa's Talking (prioritaire lorsque AFRICASTALKING_API_KEY est configuré)
// 2. Zavu (passerelle secondaire lorsque ZAVU_API_KEY est configuré)
// 3. Termii (passerelle tertiaire lorsque TERMII_API_KEY est configuré)
// 4. Mode Simulation (repli transparent en environnement de développement / tests)

import { sendAfricaTalkingSms, formatAfricaTalkingPhone } from "./africastalking";
import { sendZavuOtpSms, sendZavuMessage, formatE164Phone, ZavuSendResult } from "./zavu";
import { sendOtpSms as sendTermiiOtpSms, sendNotificationSms as sendTermiiNotificationSms, formatWestAfricaPhone, SmsSendResult } from "./termii";

export { formatAfricaTalkingPhone } from "./africastalking";
export { formatE164Phone } from "./zavu";
export { formatWestAfricaPhone } from "./termii";

export interface SendOtpParams {
  phone: string;
  code: string;
  expiresInMin?: number;
}

export interface UnifiedSmsResult {
  success: boolean;
  provider: "africastalking" | "zavu" | "termii" | "simulation";
  messageId?: string;
  simulated: boolean;
  error?: string;
}

/**
 * Envoie un code OTP par SMS en sélectionnant automatiquement la meilleure passerelle disponible.
 */
export async function sendOtpSms({
  phone,
  code,
  expiresInMin = 5,
}: SendOtpParams): Promise<UnifiedSmsResult> {
  const hasAfricaTalking = Boolean(process.env.AFRICASTALKING_API_KEY?.trim());
  const hasZavu = Boolean(process.env.ZAVU_API_KEY?.trim());
  const hasTermii = Boolean(process.env.TERMII_API_KEY?.trim());

  const message = `Kènè ✨ Ton code de validation est : ${code} (valable ${expiresInMin} min). Ne le partage à personne.`;

  let lastError: string | undefined;

  // 1. Priorité Africa's Talking (Africa API)
  if (hasAfricaTalking) {
    const res = await sendAfricaTalkingSms({ to: phone, message });
    if (res.success) {
      return {
        success: true,
        provider: res.simulated ? "simulation" : "africastalking",
        messageId: res.messageId,
        simulated: res.simulated,
      };
    }
    lastError = res.error;
    console.warn(`[SMS Router Fallback] Africa's Talking n'a pas pu émettre (${res.error}) — bascule automatique sur Zavu.`);
  }

  // 2. Passerelle Zavu (WhatsApp / SMS)
  if (hasZavu) {
    const res: ZavuSendResult = await sendZavuOtpSms(phone, code, expiresInMin);
    if (res.success) {
      return {
        success: true,
        provider: res.simulated ? "simulation" : "zavu",
        messageId: res.messageId,
        simulated: res.simulated,
      };
    }
    lastError = res.error;
    console.warn(`[SMS Router Fallback] Zavu n'a pas pu émettre (${res.error}) — bascule automatique sur Termii.`);
  }

  // 3. Passerelle Termii
  if (hasTermii) {
    const res: SmsSendResult = await sendTermiiOtpSms({ phone, code, expiresInMin });
    if (res.success) {
      return {
        success: true,
        provider: res.simulated ? "simulation" : "termii",
        messageId: res.messageId,
        simulated: res.simulated,
      };
    }
    lastError = res.error;
    console.warn(`[SMS Router Fallback] Termii indisponible (${res.error}) — bascule sur simulation locale.`);
  }

  // 4. Simulation locale (environnement de développement)
  const e164 = formatE164Phone(phone);
  console.log(`[SMS OTP Simulation] To: ${e164} | Code: ${code} (valide ${expiresInMin} min)`);
  return {
    success: true,
    provider: "simulation",
    messageId: `sim_otp_${Date.now()}`,
    simulated: true,
    error: lastError,
  };
}

/**
 * Envoie une notification textuelle par SMS.
 */
export async function sendNotificationSms({
  phone,
  message,
  senderId = "Kene",
}: {
  phone: string;
  message: string;
  senderId?: string;
}): Promise<UnifiedSmsResult> {
  const hasAfricaTalking = Boolean(process.env.AFRICASTALKING_API_KEY?.trim());
  const hasZavu = Boolean(process.env.ZAVU_API_KEY?.trim());
  const hasTermii = Boolean(process.env.TERMII_API_KEY?.trim());

  // 1. Priorité Africa's Talking
  if (hasAfricaTalking) {
    const res = await sendAfricaTalkingSms({ to: phone, message, from: senderId });
    if (res.success) {
      return {
        success: true,
        provider: res.simulated ? "simulation" : "africastalking",
        messageId: res.messageId,
        simulated: res.simulated,
      };
    }
    console.warn(`[Notification Router Fallback] Africa's Talking n'a pas pu émettre (${res.error}) — bascule sur Zavu.`);
  }

  // 2. Passerelle Zavu
  if (hasZavu) {
    const res = await sendZavuMessage({ phone, text: message, channel: "sms" });
    if (res.success) {
      return {
        success: true,
        provider: res.simulated ? "simulation" : "zavu",
        messageId: res.messageId,
        simulated: res.simulated,
      };
    }
    console.warn(`[Notification Router Fallback] Zavu n'a pas pu émettre (${res.error}) — bascule sur Termii.`);
  }

  // 3. Passerelle Termii
  if (hasTermii) {
    const res = await sendTermiiNotificationSms({ phone, message, senderId });
    if (res.success) {
      return {
        success: true,
        provider: res.simulated ? "simulation" : "termii",
        messageId: res.messageId,
        simulated: res.simulated,
      };
    }
  }

  // 4. Simulation locale
  const e164 = formatE164Phone(phone);
  console.log(`[SMS Notification Simulation] To: ${e164} | Message: "${message}"`);
  return {
    success: true,
    provider: "simulation",
    messageId: `sim_notif_${Date.now()}`,
    simulated: true,
  };
}
