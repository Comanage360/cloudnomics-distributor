import nodemailer from "nodemailer";
import sgMail from "@sendgrid/mail";
import { config } from "../config.js";

export interface SendQuoteInput {
  to: string;
  customerName: string;
  quoteNumber: number;
  pdf: Buffer;
  subject?: string;  // custom subject (else default)
  body?: string;     // custom plain-text body (else default)
  cc?: string[];     // optional CC recipients
}

const hasSendgrid = () => Boolean(config.sendgrid.apiKey);
const hasSmtp = () => Boolean(config.smtp.host && config.smtp.user);

/**
 * Email the quote PDF. Prefers SendGrid (Web API over HTTPS — reliable on hosts
 * that block SMTP ports), falls back to SMTP, and otherwise runs in dry-run mode
 * (logs the payload) so the app is fully runnable out of the box.
 */
export async function sendQuoteEmail(input: SendQuoteInput) {
  const { to, customerName, quoteNumber, pdf } = input;
  const subject = input.subject?.trim() || `Your quote #${quoteNumber} from Cloudnomics`;
  const text = input.body?.trim() ||
    `Hi ${customerName},\n\nPlease find your quote (#${quoteNumber}) attached.\n\n` +
    `Thank you,\nCloudnomics`;
  const cc = (input.cc || []).map((c) => c.trim()).filter(Boolean);
  const filename = `quote-${quoteNumber}.pdf`;

  // 1) SendGrid Web API
  if (hasSendgrid()) {
    sgMail.setApiKey(config.sendgrid.apiKey);
    try {
      const [res] = await sgMail.send({
        to,
        ...(cc.length ? { cc } : {}),
        from: config.smtp.from, // must be a verified SendGrid sender / domain
        subject,
        text,
        attachments: [
          { filename, type: "application/pdf", disposition: "attachment", content: pdf.toString("base64") },
        ],
      });
      return { dryRun: false, messageId: res.headers["x-message-id"] || null, provider: "sendgrid" };
    } catch (e) {
      const err = e as { response?: { body?: unknown }; message?: string };
      console.error("[mailer:sendgrid] send failed:", err.response?.body || err.message);
      throw new Error("SendGrid send failed");
    }
  }

  // 2) SMTP (Nodemailer)
  if (hasSmtp()) {
    const transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
    const info = await transport.sendMail({
      from: config.smtp.from,
      to,
      ...(cc.length ? { cc } : {}),
      subject,
      text,
      attachments: [{ filename, content: pdf }],
    });
    return { dryRun: false, messageId: info.messageId, provider: "smtp" };
  }

  // 3) Dry-run
  console.log(`[mailer:dry-run] would email ${to}${cc.length ? ` cc ${cc.join(", ")}` : ""} — "${subject}" — quote #${quoteNumber} (${pdf.length} bytes)`);
  return { dryRun: true, messageId: null, provider: "dry-run" };
}

/** Send a plain-text notification to one or more recipients (no attachment).
 *  Same provider preference + dry-run fallback as sendQuoteEmail. */
export async function sendNotification(to: string[], subject: string, text: string) {
  const recipients = to.map((t) => t.trim()).filter(Boolean);
  if (!recipients.length) {
    console.log(`[mailer:dry-run] notification with no recipients — "${subject}"`);
    return { dryRun: true, provider: "dry-run" };
  }

  if (hasSendgrid()) {
    sgMail.setApiKey(config.sendgrid.apiKey);
    try {
      await sgMail.send({ to: recipients, from: config.smtp.from, subject, text });
      return { dryRun: false, provider: "sendgrid" };
    } catch (e) {
      const err = e as { response?: { body?: unknown }; message?: string };
      console.error("[mailer:sendgrid] notification failed:", err.response?.body || err.message);
      throw new Error("SendGrid send failed");
    }
  }

  if (hasSmtp()) {
    const transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
    await transport.sendMail({ from: config.smtp.from, to: recipients, subject, text });
    return { dryRun: false, provider: "smtp" };
  }

  console.log(`[mailer:dry-run] would notify ${recipients.join(", ")} — "${subject}"\n${text}`);
  return { dryRun: true, provider: "dry-run" };
}

// ---- Branded HTML system emails (welcome / verify / password reset) ----

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface BrandedEmail {
  heading: string;
  intro: string;        // one or two sentences (plain text; newlines become <br>)
  ctaText?: string;
  ctaUrl?: string;
  outro?: string;       // small print under the button
}

/** Wrap content in the Cloudnomics-branded, inline-CSS HTML shell (email-client
 *  safe). Returns { html, text } — text is a plain-text fallback. */
export function renderBrandedEmail(e: BrandedEmail): { html: string; text: string } {
  const introHtml = esc(e.intro).replace(/\n/g, "<br>");
  const button = e.ctaText && e.ctaUrl
    ? `<tr><td style="padding:6px 0 4px;">
         <a href="${e.ctaUrl}" style="display:inline-block;background:#FF5A36;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 26px;border-radius:10px;">${esc(e.ctaText)}</a>
       </td></tr>`
    : "";
  const outroHtml = e.outro
    ? `<tr><td style="padding:14px 0 0;color:#5C6781;font-size:12.5px;line-height:1.5;">${esc(e.outro).replace(/\n/g, "<br>")}</td></tr>`
    : "";
  const linkFallback = e.ctaUrl
    ? `<tr><td style="padding:14px 0 0;color:#5C6781;font-size:12px;line-height:1.5;word-break:break-all;">Or copy this link:<br><span style="color:#FF5A36;">${esc(e.ctaUrl)}</span></td></tr>`
    : "";

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#F4F6FA;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FA;padding:24px 0;font-family:Segoe UI,Arial,sans-serif;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:92%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 8px 30px rgba(8,12,22,.08);">
        <tr><td style="background:#0E1424;padding:18px 26px;">
          <span style="color:#ffffff;font-size:18px;font-weight:800;letter-spacing:-.01em;">Cloudnomics</span>
          <span style="color:#FF5A36;font-size:18px;font-weight:800;">.</span>
          <span style="color:#8792A8;font-size:12px;padding-left:8px;">Distributor Console</span>
        </td></tr>
        <tr><td style="padding:28px 26px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="color:#131A2B;font-size:19px;font-weight:700;padding-bottom:10px;">${esc(e.heading)}</td></tr>
            <tr><td style="color:#3A4257;font-size:14px;line-height:1.6;padding-bottom:18px;">${introHtml}</td></tr>
            ${button}
            ${linkFallback}
            ${outroHtml}
          </table>
        </td></tr>
        <tr><td style="background:#F4F6FA;padding:16px 26px;color:#8792A8;font-size:11.5px;line-height:1.5;">
          Cloudnomics · Authorized Palo Alto Networks distributor.<br>
          This is an automated message — please don't reply.
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;

  const text = [e.heading, "", e.intro, e.ctaUrl ? `\n${e.ctaText || "Open"}: ${e.ctaUrl}` : "", e.outro ? `\n${e.outro}` : "",
    "\n— Cloudnomics · Authorized Palo Alto Networks distributor"].filter((s) => s !== "").join("\n");

  return { html, text };
}

/** Send an HTML email (with plain-text fallback). SendGrid → SMTP → dry-run. */
export async function sendEmail(to: string, subject: string, html: string, text: string) {
  if (hasSendgrid()) {
    sgMail.setApiKey(config.sendgrid.apiKey);
    try {
      await sgMail.send({ to, from: config.smtp.from, subject, text, html });
      return { dryRun: false, provider: "sendgrid" };
    } catch (e) {
      const err = e as { response?: { body?: unknown }; message?: string };
      console.error("[mailer:sendgrid] send failed:", err.response?.body || err.message);
      throw new Error("SendGrid send failed");
    }
  }
  if (hasSmtp()) {
    const transport = nodemailer.createTransport({
      host: config.smtp.host, port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
    await transport.sendMail({ from: config.smtp.from, to, subject, text, html });
    return { dryRun: false, provider: "smtp" };
  }
  console.log(`[mailer:dry-run] would email ${to} — "${subject}"`);
  return { dryRun: true, provider: "dry-run" };
}

/** Welcome + verify-your-email (sent on signup). */
export function sendWelcomeEmail(to: string, company: string, verifyUrl: string) {
  const { html, text } = renderBrandedEmail({
    heading: `Welcome to Cloudnomics, ${company}!`,
    intro:
      "Your reseller account is ready. You can start building expert Palo Alto Networks quotes right away.\n\n" +
      "First, please confirm your email address so we know it's really you.",
    ctaText: "Verify my email",
    ctaUrl: verifyUrl,
    outro: "This link expires in 24 hours. If you didn't create this account, you can ignore this email.",
  });
  return sendEmail(to, "Welcome to Cloudnomics — please verify your email", html, text);
}

/** Standalone "verify your email" (resend). */
export function sendVerificationEmail(to: string, verifyUrl: string) {
  const { html, text } = renderBrandedEmail({
    heading: "Verify your email",
    intro: "Please confirm your email address to finish securing your Cloudnomics account.",
    ctaText: "Verify my email",
    ctaUrl: verifyUrl,
    outro: "This link expires in 24 hours. If you didn't request this, you can ignore this email.",
  });
  return sendEmail(to, "Verify your Cloudnomics email", html, text);
}

/** Password reset link. */
export function sendPasswordResetEmail(to: string, resetUrl: string) {
  const { html, text } = renderBrandedEmail({
    heading: "Reset your password",
    intro: "We received a request to reset your Cloudnomics password. Click below to choose a new one.",
    ctaText: "Reset password",
    ctaUrl: resetUrl,
    outro: "This link expires in 1 hour. If you didn't request a reset, you can safely ignore this email — your password won't change.",
  });
  return sendEmail(to, "Reset your Cloudnomics password", html, text);
}
