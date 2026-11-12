// Kènè — Alertes administrateur temps réel (Telegram · WhatsApp · SMS · Webhook).
//
// Principes :
// • JAMAIS bloquant ni levant : toutes les erreurs sont avalées ;
// • anti-spam : une même clé d'alerte n'est relayée qu'une fois / 10 min,
//   et le canal SMS (payant) est plafonné à 6 envois / heure ;
// • canaux activés uniquement si leurs variables d'environnement existent :
//   - Telegram : TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
//   - WhatsApp : CALLMEBOT_WHATSAPP_APIKEY (+ ADMIN_ALERT_PHONE)
//   - SMS      : ADMIN_ALERT_PHONE (passerelle SMS existante, alertes critiques)
//   - Webhook  : ALERT_WEBHOOK_URL / DISCORD_WEBHOOK_URL

export type AlertSeverity = "info" | "warning" | "critical";

export interface AdminAlert {
  key: string; // clé de déduplication (ex: "login_locked:1.2.3.4")
  title: string;
  lines?: string[];
  severity?: AlertSeverity;
}

const DEDUP_MS = 10 * 60_000;
const SMS_MAX_PER_HOUR = 6;

const g = globalThis as typeof globalThis & {
  __keneAlertSeen?: Map<string, number>;
  __keneAlertSms?: number[];
};

/** Numéro admin normalisé au format international ivoirien (+225…). */
export function adminAlertPhone(): string | null {
  const raw = (process.env.ADMIN_ALERT_PHONE || "").replace(/[^\d+]/g, "");
  if (!raw) return null;
  if (raw.startsWith("+")) return raw;
  if (raw.startsWith("225")) return `+${raw}`;
  return `+225${raw}`;
}

export function alertChannelsStatus() {
  return {
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    whatsapp: Boolean(process.env.CALLMEBOT_WHATSAPP_APIKEY && adminAlertPhone()),
    sms: Boolean(adminAlertPhone()),
    webhook: Boolean(process.env.ALERT_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL),
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Envoie une alerte sur tous les canaux configurés (fire-and-forget). */
export async function sendAdminAlert(alert: AdminAlert, opts: { force?: boolean } = {}): Promise<{ sent: string[] }> {
  const sent: string[] = [];
  try {
    const now = Date.now();
    const seen = (g.__keneAlertSeen ??= new Map());
    if (!opts.force) {
      const last = seen.get(alert.key);
      if (last && now - last < DEDUP_MS) return { sent };
    }
    seen.set(alert.key, now);
    if (seen.size > 500) {
      for (const [k, t] of seen) if (now - t > DEDUP_MS) seen.delete(k);
    }

    const severity = alert.severity ?? "warning";
    const icon = severity === "critical" ? "🚨" : severity === "warning" ? "⚠️" : "ℹ️";
    const date = new Date().toLocaleString("fr-FR", { timeZone: "Africa/Abidjan" });
    const lines = (alert.lines ?? []).map((l) => l.slice(0, 200));
    const plain = `${icon} KÈNÈ — ${alert.title}\n${lines.map((l) => `• ${l}`).join("\n")}\n🕒 ${date}`.trim();

    const jobs: Promise<unknown>[] = [];

    // Telegram
    const tgToken = process.env.TELEGRAM_BOT_TOKEN;
    const tgChat = process.env.TELEGRAM_CHAT_ID;
    if (tgToken && tgChat) {
      const html = `${icon} <b>KÈNÈ — ${escapeHtml(alert.title)}</b>\n${lines.map((l) => `• ${escapeHtml(l)}`).join("\n")}\n🕒 ${escapeHtml(date)}`;
      jobs.push(
        fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: tgChat, text: html, parse_mode: "HTML", disable_web_page_preview: true }),
          signal: AbortSignal.timeout(8000),
        }).then((r) => r.ok && sent.push("telegram")),
      );
    }

    // WhatsApp (CallMeBot — gratuit, activation unique côté admin)
    const phone = adminAlertPhone();
    const cmbKey = process.env.CALLMEBOT_WHATSAPP_APIKEY;
    if (phone && cmbKey) {
      const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(plain)}&apikey=${encodeURIComponent(cmbKey)}`;
      jobs.push(fetch(url, { signal: AbortSignal.timeout(10000) }).then((r) => r.ok && sent.push("whatsapp")));
    }

    // Webhook générique (Discord / Slack)
    const webhook = process.env.ALERT_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
    if (webhook) {
      jobs.push(
        fetch(webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: plain.replace(/@(everyone|here)/g, "@ $1"), text: plain }),
          signal: AbortSignal.timeout(8000),
        }).then((r) => r.ok && sent.push("webhook")),
      );
    }

    // SMS — uniquement critique, plafonné (canal payant)
    if (phone && (severity === "critical" || opts.force)) {
      const sms = (g.__keneAlertSms ??= []).filter((t) => now - t < 3_600_000);
      g.__keneAlertSms = sms;
      if (sms.length < SMS_MAX_PER_HOUR) {
        sms.push(now);
        jobs.push(
          import("@/lib/sms")
            .then(({ sendNotificationSms }) =>
              sendNotificationSms({ phone, message: plain.slice(0, 300) }),
            )
            .then((r) => r?.success && sent.push("sms")),
        );
      }
    }

    await Promise.allSettled(jobs);
  } catch (err) {
    console.warn("[kene:alerts] relais impossible :", err instanceof Error ? err.message : err);
  }
  return { sent };
}

// ─────────────── Règles d'alerte sur le journal d'audit ───────────────

const AUDIT_ALERT_RULES: Record<string, { title: string; severity: AlertSeverity }> = {
  security_alert: { title: "Attaque bloquée par le bouclier", severity: "warning" },
  login_locked: { title: "Compte verrouillé (force brute)", severity: "warning" },
  admin_elevate_failed: { title: "Échec d'élévation ADMIN", severity: "critical" },
  impossible_travel: { title: "Déplacement impossible détecté", severity: "critical" },
  velocity_anomaly: { title: "Changement d'IP suspect", severity: "warning" },
  pin_change_locked: { title: "Changement de PIN verrouillé", severity: "warning" },
  passkey_registered: { title: "Nouvelle passkey enregistrée", severity: "critical" },
  passkey_removed: { title: "Passkey supprimée", severity: "warning" },
  admin_promoted: { title: "Nouvel administrateur promu", severity: "critical" },
  admin_demoted: { title: "Administrateur rétrogradé", severity: "warning" },
  upload_reject: { title: "Fichier malveillant rejeté", severity: "warning" },
};

export function alertForAuditEvent(evt: {
  kind: string;
  ip?: string | null;
  phone?: string | null;
  detail?: string | null;
}): void {
  const rule = AUDIT_ALERT_RULES[evt.kind];
  if (!rule) return;
  const lines = [
    `Type : ${evt.kind}`,
    evt.ip ? `IP : ${evt.ip}` : "",
    evt.phone ? `Compte : ${evt.phone}` : "",
    evt.detail ? `Détail : ${evt.detail}` : "",
  ].filter(Boolean);
  void sendAdminAlert({ key: `${evt.kind}:${evt.ip ?? ""}`, title: rule.title, lines, severity: rule.severity });
}
