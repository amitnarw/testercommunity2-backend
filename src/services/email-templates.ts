/**
 * Centralized, on-brand email templates for inTesters.
 *
 * All emails share a single layout (baseEmailLayout) so branding, fonts, and
 * footer stay consistent. Inline styles only ,  emails cannot read the site's
 * CSS variables. Brand tokens mirror globals.css / tax-invoice.tsx:
 *   primary #3b82f6 / primary-dark #1e40af / primary-light #eff6ff
 * Font: Plus Jakarta Sans (loaded per-email via Google Fonts <link>).
 */

export const EMAIL_BRAND = {
  name: "inTesters",
  primary: "#3b82f6",
  primaryDark: "#1e40af",
  primaryLight: "#eff6ff",
  text: "#0f172a",
  muted: "#64748b",
  border: "#e2e8f0",
  background: "#f8fafc",
  card: "#ffffff",
  logoUrl: "https://intesters.com/inTesters-logo-dark.svg",
  website: "https://www.intesters.com",
  supportUrl: "https://www.intesters.com/support",
  from: "inTesters <noreply@intesters.com>",
};

const FONT_LINK =
  "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap";

/**
 * Wraps email body content in a consistent, responsive layout.
 * @param opts.title    Document <title> (also used for preheader fallback)
 * @param opts.preview  Preheader text shown in inbox preview (hidden in body)
 * @param opts.body     Inner HTML placed inside the white card
 */
export function baseEmailLayout({
  title,
  preview,
  body,
}: {
  title: string;
  preview: string;
  body: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="${FONT_LINK}" rel="stylesheet" />
    <style>
      html, body { margin: 0; padding: 0; }
      body {
        background-color: ${EMAIL_BRAND.background};
        font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        color: ${EMAIL_BRAND.text};
        -webkit-font-smoothing: antialiased;
      }
      table { border-collapse: collapse; }
      a { color: ${EMAIL_BRAND.primaryDark}; text-decoration: none; }
      .btn {
        display: inline-block;
        background-color: ${EMAIL_BRAND.primary};
        color: #ffffff !important;
        font-weight: 600;
        font-size: 15px;
        line-height: 1;
        padding: 14px 28px;
        border-radius: 10px;
        text-decoration: none;
      }
      .btn:hover { background-color: ${EMAIL_BRAND.primaryDark}; }
      .footer-link { color: ${EMAIL_BRAND.muted}; text-decoration: underline; }
      @media only screen and (max-width: 600px) {
        .container { width: 100% !important; padding: 16px !important; }
        .card { border-radius: 14px !important; }
      }
    </style>
  </head>
  <body>
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preview}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${EMAIL_BRAND.background};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;">
            <tr>
              <td align="center" style="padding-bottom:20px;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:20px;background-color:${EMAIL_BRAND.card};border-radius:999px;padding:12px 40px;box-shadow:0 1px 3px rgba(15,23,42,0.06),0 8px 24px rgba(15,23,42,0.04);">
                  <tr>
                    <td align="center" style="padding:10px 40px;">
                      <a href="${EMAIL_BRAND.website}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:10px;text-decoration:none;padding:0 8px;">
                        <img src="${EMAIL_BRAND.logoUrl}" alt="" width="40" height="40" style="display:block;width:40px;height:40px;" />
                        <span style="font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:30px;font-weight:800;letter-spacing:-0.02em;color:${EMAIL_BRAND.primary};">${EMAIL_BRAND.name}</span>
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="card" style="background-color:${EMAIL_BRAND.card};border:1px solid ${EMAIL_BRAND.border};border-radius:18px;padding:36px 40px;box-shadow:0 1px 3px rgba(15,23,42,0.06),0 8px 24px rgba(15,23,42,0.04);">
                ${body}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-top:24px;font-size:12px;line-height:18px;color:${EMAIL_BRAND.muted};">
                <p style="margin:0 0 4px;">© ${new Date().getFullYear()} ${EMAIL_BRAND.name} ,  Gamdix Private Limited</p>
                <p style="margin:0;">
                  <a class="footer-link" href="${EMAIL_BRAND.website}" target="_blank" rel="noopener">Website</a>
                  &nbsp;·&nbsp;
                  <a class="footer-link" href="${EMAIL_BRAND.supportUrl}" target="_blank" rel="noopener">Support</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Email verification ,  sent on signup via better-auth. */
export function verificationEmailHtml(verifyUrl: string): string {
  const body = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;letter-spacing:-0.02em;color:${EMAIL_BRAND.text};">
      Confirm your email
    </h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:24px;color:${EMAIL_BRAND.muted};">
      Thanks for joining ${EMAIL_BRAND.name}. Just one quick step, verify your email address to activate your account and start testing.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td align="center" style="border-radius:10px;background-color:${EMAIL_BRAND.primary};">
          <a class="btn" href="${verifyUrl}" target="_blank" rel="noopener">Verify my email</a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;font-size:13px;line-height:20px;color:${EMAIL_BRAND.muted};">
      Or paste this link into your browser:
    </p>
    <p style="margin:0;font-size:13px;line-height:20px;word-break:break-all;">
      <a href="${verifyUrl}" target="_blank" rel="noopener">${verifyUrl}</a>
    </p>
    <hr style="border:0;border-top:1px solid ${EMAIL_BRAND.border};margin:28px 0;" />
    <p style="margin:0;font-size:13px;line-height:20px;color:${EMAIL_BRAND.muted};">
      If you didn't create an ${EMAIL_BRAND.name} account, you can safely ignore this email. This link expires in 24 hours.
    </p>
  `;
  return baseEmailLayout({
    title: "Verify your email | inTesters",
    preview: "Confirm your email to activate your inTesters account.",
    body,
  });
}

export interface PaymentReceiptInput {
  amount: string;
  currency?: string;
  paymentId?: string;
  description?: string;
  walletUrl?: string;
}

/** Payment success receipt ,  sent after a Razorpay payment.captured webhook. */
export function paymentReceiptEmailHtml({
  amount,
  currency = "INR",
  paymentId,
  description = "inTesters purchase",
  walletUrl = "https://www.intesters.com/wallet",
}: PaymentReceiptInput): string {
  const summaryRow = (label: string, value: string) => `
    <tr>
      <td style="padding:10px 0;font-size:14px;color:${EMAIL_BRAND.muted};">${label}</td>
      <td align="right" style="padding:10px 0;font-size:14px;font-weight:600;color:${EMAIL_BRAND.text};">${value}</td>
    </tr>`;

  const body = `
    <div style="display:inline-flex;align-items:center;gap:8px;background-color:${EMAIL_BRAND.primaryLight};color:${EMAIL_BRAND.primaryDark};font-size:13px;font-weight:600;padding:6px 12px;border-radius:999px;margin-bottom:20px;">
      ✓ Payment successful
    </div>
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;letter-spacing:-0.02em;color:${EMAIL_BRAND.text};">
      Thank you for your purchase!
    </h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:24px;color:${EMAIL_BRAND.muted};">
      We've received your payment on ${EMAIL_BRAND.name}. Your packages and transaction history are now available in your wallet.
    </p>
    <div style="background-color:${EMAIL_BRAND.background};border:1px solid ${EMAIL_BRAND.border};border-radius:12px;padding:8px 20px;margin:0 0 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${summaryRow("Description", description)}
        ${paymentId ? summaryRow("Payment ID", paymentId) : ""}
        ${summaryRow("Amount paid", `${currency} ${amount}`)}
      </table>
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
      <tr>
        <td align="center" style="border-radius:10px;background-color:${EMAIL_BRAND.primary};">
          <a class="btn" href="${walletUrl}" target="_blank" rel="noopener">View my wallet</a>
        </td>
      </tr>
    </table>
    <p style="margin:24px 0 0;font-size:13px;line-height:20px;color:${EMAIL_BRAND.muted};">
      A detailed tax invoice is available in your wallet. If you have any questions, our support team is here to help.
    </p>
  `;
  return baseEmailLayout({
    title: "Payment Successful | inTesters",
    preview: "Your inTesters payment was successful. View your wallet for details.",
    body,
  });
}
