import { Resend } from "resend";
import logger from "../utils/logger";

export const sendEmail = async ({
  from,
  to,
  subject,
  html,
}: {
  from: string;
  to: string;
  subject: string;
  html: string;
}) => {
  if (!process.env.RESEND_API_KEY) {
    const msg = "Resend API key not configured";
    logger.error(msg, { to, subject });
    return { success: false, error: msg };
  }
  if (!from || !to || !subject) {
    const msg = "Missing required email field";
    logger.error(msg, { to, subject, from });
    return { success: false, error: msg };
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
    });

    if (error) {
      logger.error("Resend API returned error", { to, subject, error });
      return { success: false, error };
    }

    logger.info("Email sent via Resend", { to, subject, resendId: (data as any)?.id });
    return { success: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    logger.error("Resend client threw", { to, subject, err: msg });
    return { success: false, error: msg };
  }
};
