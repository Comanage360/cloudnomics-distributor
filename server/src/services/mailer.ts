import nodemailer from "nodemailer";
import { config } from "../config.js";

export interface SendQuoteInput {
  to: string;
  customerName: string;
  quoteNumber: number;
  pdf: Buffer;
}

const hasSmtp = () => Boolean(config.smtp.host && config.smtp.user);

/**
 * Email the quote PDF. If SMTP isn't configured, runs in dry-run mode and logs
 * the payload instead of sending — so the app is fully runnable out of the box.
 */
export async function sendQuoteEmail(input: SendQuoteInput) {
  const { to, customerName, quoteNumber, pdf } = input;
  const subject = `Your quote #${quoteNumber} from Cloudnomics`;
  const text =
    `Hi ${customerName},\n\nPlease find your quote (#${quoteNumber}) attached.\n\n` +
    `Thank you,\nCloudnomics`;

  if (!hasSmtp()) {
    console.log(`[mailer:dry-run] would email ${to} — quote #${quoteNumber} (${pdf.length} bytes)`);
    return { dryRun: true, messageId: null };
  }

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
    attachments: [{ filename: `quote-${quoteNumber}.pdf`, content: pdf }],
  });

  return { dryRun: false, messageId: info.messageId };
}
