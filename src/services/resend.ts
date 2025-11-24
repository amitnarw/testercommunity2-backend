import { Resend } from "resend";

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
  const resend = new Resend(process.env.RESEND_API_KEY);
  if (process.env.RESEND_API_KEY || !resend) {
    return { success: false, error: "Resend API not found" };
  }

  const { data, error } = await resend.emails.send({
    from,
    to,
    subject,
    html,
  });

  if (error) {
    return { success: false, error };
  }

  return { success: true, data: "Email sent successfully" + data };
};
