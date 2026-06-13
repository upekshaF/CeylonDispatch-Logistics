/**
 * Resend (https://resend.com) configuration.
 *
 * 1. Create an API key at https://resend.com/api-keys and paste it below.
 * 2. Set EMAIL_FROM to a sender on a domain you verified in Resend
 *    (e.g. "CeylonDispatch <updates@yourdomain.lk>").
 *
 * While RESEND_API_KEY is empty, emails are SIMULATED: they appear in the
 * email log with status "simulated" and nothing is sent.
 *
 * Note: the Resend API blocks browser-origin (CORS) calls, so requests go
 * through the Vite dev-server proxy (/resend-api → api.resend.com, see
 * vite.config.ts). A deployed app needs an equivalent backend proxy and
 * should keep the key server-side.
 *
 * EMAIL_FROM must be on a Resend-verified domain. Without a verified domain,
 * only "onboarding@resend.dev" works, and only the Resend account owner's
 * address can RECEIVE (test mode). Gmail/free-mail senders are rejected.
 */
export const RESEND_API_KEY = "re_NJsj3Td4_GDBpq22uBAp229NiMryPWMfg";
export const EMAIL_FROM = "CeylonDispatch <onboarding@resend.dev>";
