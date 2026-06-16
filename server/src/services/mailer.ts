import nodemailer from "nodemailer";
import sgMail from "@sendgrid/mail";
import { config } from "../config.js";

export interface SendQuoteInput {
  to: string;
  customerName: string;
  quoteNumber: number;
  pdf: Buffer;
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
  const subject = `Your quote #${quoteNumber} from Cloudnomics`;
  const text =
    `Hi ${customerName},\n\nPlease find your quote (#${quoteNumber}) attached.\n\n` +
    `Thank you,\nCloudnomics`;
  const filename = `quote-${quoteNumber}.pdf`;

  // 1) SendGrid Web API
  if (hasSendgrid()) {
    sgMail.setApiKey(config.sendgrid.apiKey);
    try {
      const [res] = await sgMail.send({
        to,
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
      subject,
      text,
      attachments: [{ filename, content: pdf }],
    });
    return { dryRun: false, messageId: info.messageId, provider: "smtp" };
  }

  // 3) Dry-run
  console.log(`[mailer:dry-run] would email ${to} — quote #${quoteNumber} (${pdf.length} bytes)`);
  return { dryRun: true, messageId: null, provider: "dry-run" };
}
