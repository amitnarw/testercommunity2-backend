export default {
  async email(message, env, ctx) {
    const { from, to, subject, headers, raw } = message;

    const fromEmail = from;
    const fromName = headers.get("from")?.split("<")[0]?.trim() || null;
    const toAddress = to;
    const bodyText = await message.text();
    const bodyHtml = await message.html?.() || bodyText;

    const payload = {
      fromEmail,
      fromName,
      toAddress,
      subject: subject || "(no subject)",
      body: bodyHtml || bodyText,
      attachments: null,
      messageId: headers.get("message-id") || null,
      inReplyTo: headers.get("in-reply-to") || headers.get("references") || null,
    };

    try {
      const resp = await fetch(`${env.API_BASE}/api/admin/mail/inbound`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-mail-secret": env.MAIL_WEBHOOK_SECRET,
        },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        console.error("Mail ingest failed:", await resp.text());
      }
    } catch (err) {
      console.error("Mail ingest error:", err.message);
    }

    await message.forward("intesters@appdix.com");
  },
};
