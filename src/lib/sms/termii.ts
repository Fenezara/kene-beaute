// Kènè — Passerelle SMS OTP officielle (Termii · Côte d'Ivoire & Sénégal)
// Gère l'envoi direct de SMS aux utilisatrices pour l'authentification OTP et les notifications.
// 1. Normalisation et nettoyage des numéros E.164 (+225 10 chiffres, +221 9 chiffres)
// 2. Formatage du message avec signature de marque Kènè
// 3. Repli transparent en mode simulation si TERMII_API_KEY est absent (zéro régression en dev/test)

export interface SendOtpSmsParams {
  phone: string;
  code: string;
  expiresInMin?: number;
}

export interface SmsSendResult {
  success: boolean;
  messageId?: string;
  simulated: boolean;
  error?: string;
}

/**
 * Nettoie et normalise le numéro de téléphone pour les réseaux ouest-africains.
 * Termii attend le format international sans le '+' initial (ex: 2250701020304).
 */
export function formatWestAfricaPhone(rawPhone: string): string {
  // Supprime tous les espaces, tirets, parenthèses et le '+' initial
  let cleaned = rawPhone.replace(/[^\d+]/g, "").trim();
  if (cleaned.startsWith("+")) {
    cleaned = cleaned.slice(1);
  }

  // Si l'utilisatrice a saisi un numéro ivoirien sans indicatif (10 chiffres commençant par 01, 05, 07)
  if (/^0[157]\d{8}$/.test(cleaned)) {
    cleaned = "225" + cleaned;
  }
  // Si numéro sénégalais sans indicatif (9 chiffres commençant par 7)
  else if (/^7[0-8]\d{7}$/.test(cleaned)) {
    cleaned = "221" + cleaned;
  }

  return cleaned;
}

/**
 * Envoie un code OTP à usage unique par SMS.
 */
export async function sendOtpSms({
  phone,
  code,
  expiresInMin = 5,
}: SendOtpSmsParams): Promise<SmsSendResult> {
  const apiKey = process.env.TERMII_API_KEY?.trim();
  const senderId = process.env.TERMII_SENDER_ID?.trim() || "Kene";
  const normalizedPhone = formatWestAfricaPhone(phone);
  const message = `Kènè ✨ Ton code de validation est : ${code} (valable ${expiresInMin} min). Ne le partage à personne.`;

  // Mode simulation si clé non configurée
  if (!apiKey) {
    console.log(`[SMS OTP Termii · Simulation] To: +${normalizedPhone} | Code: ${code} | Message: "${message}"`);
    return {
      success: true,
      simulated: true,
    };
  }

  try {
    // Termii recommande le canal 'dnd' (Direct Delivery) pour les OTP et SMS transactionnels en Afrique de l'Ouest
    let res = await fetch("https://api.ng.termii.com/api/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: normalizedPhone,
        from: senderId,
        sms: message,
        type: "plain",
        channel: "dnd",
        api_key: apiKey,
      }),
      signal: AbortSignal.timeout(8000),
    });

    let data = await res.json().catch(() => null);

    // Repli sur channel 'generic' si 'dnd' échoue
    if (!res.ok && data?.message?.includes("channel")) {
      res = await fetch("https://api.ng.termii.com/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: normalizedPhone,
          from: senderId,
          sms: message,
          type: "plain",
          channel: "generic",
          api_key: apiKey,
        }),
        signal: AbortSignal.timeout(8000),
      });
      data = await res.json().catch(() => null);
    }

    if (!res.ok || (data && data.code && data.code !== "ok" && data.message !== "Successfully Sent")) {
      const errMsg = data?.message || res.statusText || "Échec d'envoi SMS";
      if (errMsg.includes("SENDER_ID_NOT_APPROVED")) {
        console.error(
          `[Termii SMS] ❌ SENDER_ID_NOT_APPROVED : Le nom d'expéditeur '${senderId}' n'a pas encore été validé sur ton tableau de bord Termii (dashboard.termii.com > Sender ID > Request Sender ID).`
        );
      } else if (errMsg.includes("balance") || errMsg.includes("credit")) {
        console.error(`[Termii SMS] ❌ Solde insuffisant sur ton compte Termii.`);
      } else {
        console.error(`[Termii SMS Error] HTTP ${res.status}:`, errMsg);
      }
      return {
        success: false,
        simulated: false,
        error: errMsg,
      };
    }

    return {
      success: true,
      simulated: false,
      messageId: data?.message_id_str ?? data?.message_id,
    };
  } catch (err: any) {
    console.error("[Termii SMS Exception] Échec réseau lors de l'envoi SMS:", err?.message || err);
    return {
      success: false,
      simulated: false,
      error: err?.message || "Network error",
    };
  }
}

export interface SendNotificationSmsParams {
  phone: string;
  message: string;
  senderId?: string;
}

/**
 * Envoie un SMS transactionnel de notification (commande, RDV, rappel).
 * Si TERMII_API_KEY est absent, simule l'envoi de manière transparente.
 */
export async function sendNotificationSms({
  phone,
  message,
  senderId,
}: SendNotificationSmsParams): Promise<SmsSendResult> {
  const apiKey = process.env.TERMII_API_KEY?.trim();
  const from = senderId?.trim() || process.env.TERMII_SENDER_ID?.trim() || "Kene";
  const normalizedPhone = formatWestAfricaPhone(phone);

  if (!apiKey) {
    console.log(`[SMS Notification Termii · Simulation] To: +${normalizedPhone} | Message: "${message}"`);
    return {
      success: true,
      simulated: true,
    };
  }

  try {
    let res = await fetch("https://api.ng.termii.com/api/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: normalizedPhone,
        from,
        sms: message,
        type: "plain",
        channel: "dnd",
        api_key: apiKey,
      }),
      signal: AbortSignal.timeout(8000),
    });

    let data = await res.json().catch(() => null);

    if (!res.ok && data?.message?.includes("channel")) {
      res = await fetch("https://api.ng.termii.com/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: normalizedPhone,
          from,
          sms: message,
          type: "plain",
          channel: "generic",
          api_key: apiKey,
        }),
        signal: AbortSignal.timeout(8000),
      });
      data = await res.json().catch(() => null);
    }

    if (!res.ok || (data && data.code && data.code !== "ok" && data.message !== "Successfully Sent")) {
      const errMsg = data?.message || res.statusText || "Échec d'envoi SMS";
      if (errMsg.includes("SENDER_ID_NOT_APPROVED")) {
        console.error(
          `[Termii Notification] ❌ SENDER_ID_NOT_APPROVED : L'expéditeur '${from}' n'est pas approuvé sur Termii.`
        );
      } else if (errMsg.includes("balance") || errMsg.includes("credit")) {
        console.error(`[Termii Notification] ❌ Solde Termii insuffisant.`);
      } else {
        console.error(`[Termii Notification Error] HTTP ${res.status}:`, errMsg);
      }
      return {
        success: false,
        simulated: false,
        error: errMsg,
      };
    }

    return {
      success: true,
      simulated: false,
      messageId: data?.message_id_str ?? data?.message_id,
    };
  } catch (err: any) {
    console.error("[Termii Notification Exception] Échec réseau lors de l'envoi SMS:", err?.message || err);
    return {
      success: false,
      simulated: false,
      error: err?.message || "Network error",
    };
  }
}

