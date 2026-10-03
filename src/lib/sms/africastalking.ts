// Kènè — Passerelle Officielle Africa's Talking (Africa API)
// Couvre plus de 20 pays d'Afrique subsaharienne dont la Côte d'Ivoire (+225) et le Sénégal (+221).
// Service : Envoi de SMS OTP, notifications transactionnelles et messages marketing.
// 1. Normalisation stricte au format international E.164 (+225..., +221...)
// 2. Timeout réseau de sécurité (8s) pour ne jamais bloquer Node.js
// 3. Repli transparent en mode simulation si AFRICASTALKING_API_KEY n'est pas configuré

export interface AfricaTalkingMessageParams {
  to: string | string[]; // Un ou plusieurs numéros
  message: string;
  from?: string; // Sender ID approuvé par les régulateurs (ex: "Kene")
}

export interface AfricaTalkingSendResult {
  success: boolean;
  messageId?: string;
  recipientCount: number;
  simulated: boolean;
  cost?: string;
  error?: string;
}

/**
 * Normalise un numéro pour Africa's Talking au standard E.164 avec le '+' initial.
 * Ex: "0701020304" -> "+2250701020304"
 * Ex: "77 123 45 67" -> "+221771234567"
 */
export function formatAfricaTalkingPhone(rawPhone: string): string {
  const digits = rawPhone.replace(/[^\d+]/g, "").trim();

  if (digits.startsWith("+")) {
    return digits;
  }

  // Format ivoirien sans indicatif (10 chiffres commençant par 01, 05, 07)
  if (/^0[157]\d{8}$/.test(digits)) {
    return `+225${digits}`;
  }

  // Format sénégalais sans indicatif (9 chiffres commençant par 7)
  if (/^7[0-8]\d{7}$/.test(digits)) {
    return `+221${digits}`;
  }

  // Si indicatif présent sans le '+'
  if ((digits.startsWith("225") && digits.length === 13) || (digits.startsWith("221") && digits.length === 12)) {
    return `+${digits}`;
  }

  return digits ? `+${digits}` : "";
}

/**
 * Envoie un SMS ou OTP via l'API officielle Africa's Talking.
 */
export async function sendAfricaTalkingSms({
  to,
  message,
  from,
}: AfricaTalkingMessageParams): Promise<AfricaTalkingSendResult> {
  const apiKey = process.env.AFRICASTALKING_API_KEY?.trim();
  const username = process.env.AFRICASTALKING_USERNAME?.trim() || "sandbox";
  const senderId = from || process.env.AFRICASTALKING_SENDER_ID?.trim() || "Kene";

  const recipients = Array.isArray(to) ? to : [to];
  const normalizedRecipients = recipients.map(formatAfricaTalkingPhone).filter(Boolean);

  if (normalizedRecipients.length === 0) {
    return {
      success: false,
      recipientCount: 0,
      simulated: false,
      error: "Aucun numéro de destinataire valide",
    };
  }

  // Mode simulation automatique en environnement de dev ou sans clé API
  if (!apiKey) {
    console.log(
      `[Africa's Talking · Simulation] To: ${normalizedRecipients.join(", ")} | From: ${senderId} | Message: "${message}"`
    );
    return {
      success: true,
      simulated: true,
      recipientCount: normalizedRecipients.length,
      messageId: `sim_at_${Date.now()}`,
    };
  }

  const isSandbox = username.toLowerCase() === "sandbox";
  const endpoint = isSandbox
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";

  try {
    const formData = new URLSearchParams();
    formData.append("username", username);
    formData.append("to", normalizedRecipients.join(","));
    formData.append("message", message);
    if (senderId && !isSandbox) {
      formData.append("from", senderId);
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        apiKey,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
      signal: AbortSignal.timeout(8000), // Timeout de 8 secondes anti-blocage
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[Africa's Talking Error] HTTP ${res.status}: ${errText}`);
      return {
        success: false,
        recipientCount: normalizedRecipients.length,
        simulated: false,
        error: `Erreur Africa's Talking (${res.status}): ${errText.slice(0, 100)}`,
      };
    }

    const data = await res.json();
    const smsData = data?.SMSMessageData;
    const recipientInfo = smsData?.Recipients?.[0];
    const isSuccess = recipientInfo ? recipientInfo.statusCode === 101 || recipientInfo.status === "Success" : true;

    return {
      success: isSuccess,
      recipientCount: normalizedRecipients.length,
      simulated: false,
      messageId: recipientInfo?.messageId || `at_${Date.now()}`,
      cost: recipientInfo?.cost,
      error: isSuccess ? undefined : recipientInfo?.status || "Échec d'envoi",
    };
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Africa's Talking Exception]", msg);
    return {
      success: false,
      recipientCount: normalizedRecipients.length,
      simulated: false,
      error: `Timeout ou erreur réseau Africa's Talking : ${msg}`,
    };
  }
}
