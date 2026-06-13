/**
 * Minimal Resend email client + template builder.
 * Pure/testable: the store injects `sendWithResend` (or a fake in tests).
 */
import { RESEND_API_KEY, EMAIL_FROM } from "./config.js";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

export interface EmailSendResult {
  status: "sent" | "simulated" | "error";
  detail: string | null;
}

export type EmailSender = (msg: EmailMessage) => Promise<EmailSendResult>;

export function isEmailConfigured(): boolean {
  return RESEND_API_KEY.trim().length > 0;
}

/** Builds the customer-update email for a notification. */
export function buildUpdateEmail(input: {
  customerName: string;
  to: string;
  title: string;
  body: string;
}): EmailMessage {
  const html = [
    `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">`,
    `<div style="background:#7a1f3d;color:#fff;padding:14px 20px;border-radius:8px 8px 0 0">`,
    `<strong>CeylonDispatch</strong> · delivery update`,
    `</div>`,
    `<div style="border:1px solid #e2e8f0;border-top:0;padding:20px;border-radius:0 0 8px 8px">`,
    `<p>Hello ${escapeHtml(input.customerName)},</p>`,
    `<h2 style="font-size:16px;margin:8px 0">${escapeHtml(input.title)}</h2>`,
    `<p>${escapeHtml(input.body)}</p>`,
    `<p style="color:#64748b;font-size:12px">You receive these updates because email notifications are enabled for your account.</p>`,
    `</div></div>`,
  ].join("");
  return { to: input.to, subject: input.title, html };
}

/** Sends via the Resend API; falls back to "simulated" when no key is set. */
export const sendWithResend: EmailSender = async (msg) => {
  if (!isEmailConfigured()) {
    return { status: "simulated", detail: "No Resend API key configured" };
  }
  try {
    // Proxied through the Vite dev server (see vite.config.ts) because the
    // Resend API rejects browser-origin (CORS) requests.
    const res = await fetch("/resend-api/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { status: "error", detail: `Resend HTTP ${res.status}${body ? `: ${body.slice(0, 120)}` : ""}` };
    }
    const body = (await res.json().catch(() => null)) as { id?: string } | null;
    return { status: "sent", detail: body?.id ?? null };
  } catch (e) {
    return { status: "error", detail: e instanceof Error ? e.message : String(e) };
  }
};

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
