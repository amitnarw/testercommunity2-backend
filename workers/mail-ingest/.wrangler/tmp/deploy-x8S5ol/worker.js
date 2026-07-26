// worker.js
var worker_default = {
  async fetch(request, env, ctx) {
    return new Response("OK", { status: 200 });
  },
  async email(message, env, ctx) {
    try {
      const { from, to, subject, headers } = message;
      const fromEmail = from;
      const fromName = headers.get("from") ? headers.get("from").split("<")[0].trim() : null;
      const toAddress = to;
      const bodyText = await message.text();
      let bodyHtml = bodyText;
      try {
        if (typeof message.html === "function") {
          bodyHtml = await message.html() || bodyText;
        }
      } catch (_) {
      }
      const payload = {
        fromEmail,
        fromName,
        toAddress,
        subject: subject || "(no subject)",
        body: bodyHtml || bodyText,
        attachments: null,
        messageId: headers.get("message-id") || null,
        inReplyTo: headers.get("in-reply-to") || headers.get("references") || null
      };
      const url = env.API_BASE + "/api/admin/mail/inbound";
      console.log("Sending to:", url);
      console.log("Payload:", JSON.stringify(payload));
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-mail-secret": env.MAIL_WEBHOOK_SECRET
        },
        body: JSON.stringify(payload)
      });
      const respBody = await resp.text();
      console.log("Response:", resp.status, respBody);
    } catch (err) {
      console.error("Mail ingest error:", err.message, err.stack);
    }
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
