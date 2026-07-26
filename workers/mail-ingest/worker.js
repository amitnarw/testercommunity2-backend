export default {
  async fetch(request, env, ctx) {
    return new Response("OK", { status: 200 });
  },

  async email(message, env, ctx) {
    try {
      const { from, to, subject, headers } = message;

      const fromEmail = from;
      const fromName = headers.get("from") ? headers.get("from").split("<")[0].trim() : null;
      const toAddress = to;

      const rawEmail = await new Response(message.raw).text();
      const { text, html, subjectFromHeaders } = parseEmailBody(rawEmail);

      const subjectHeader = subject || headers.get("subject") || subjectFromHeaders || "";
      const displayBody = text || (html ? stripHtml(html) : "") || "(empty)";

      const payload = {
        fromEmail,
        fromName,
        toAddress,
        subject: subjectHeader || "(no subject)",
        body: displayBody,
        attachments: null,
        messageId: headers.get("message-id") || null,
        inReplyTo: headers.get("in-reply-to") || headers.get("references") || null,
      };

      const url = env.API_BASE + "/api/admin/mail/inbound";
      console.log("Sending to:", url);

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-mail-secret": env.MAIL_WEBHOOK_SECRET,
        },
        body: JSON.stringify(payload),
      });

      const respBody = await resp.text();
      console.log("Response:", resp.status, respBody);
    } catch (err) {
      console.error("Mail ingest error:", err.message, err.stack);
    }
  }
};

function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseEmailBody(raw) {
  let text = "";
  let html = "";
  let subjectFromHeaders = "";

  const headerEnd = raw.indexOf("\r\n\r\n");
  if (headerEnd === -1) return { text: raw, html: "", subjectFromHeaders: "" };

  const headersPart = raw.substring(0, headerEnd);
  const bodyPart = raw.substring(headerEnd + 4);

  const subjectMatch = headersPart.match(/^Subject:\s*(.+)$/im);
  if (subjectMatch) {
    subjectFromHeaders = subjectMatch[1].trim();
  }

  const contentType = headersPart.match(/Content-Type:\s*([^\r\n;]+)/i);
  const ct = contentType ? contentType[1].trim().toLowerCase() : "";

  if (ct === "text/html") {
    html = bodyPart.trim();
    return { text: "", html, subjectFromHeaders };
  }

  if (ct === "text/plain") {
    text = bodyPart.trim();
    return { text, html: "", subjectFromHeaders };
  }

  const boundaryMatch = headersPart.match(/boundary="?([^";\r\n]+)"?/i);
  if (!boundaryMatch) {
    return { text: bodyPart.trim(), html: "", subjectFromHeaders };
  }

  const boundary = boundaryMatch[1];
  const parts = bodyPart.split("--" + boundary);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed || trimmed === "--") continue;

    const partHeaderEnd = trimmed.indexOf("\r\n\r\n");
    if (partHeaderEnd === -1) continue;

    const partHeaders = trimmed.substring(0, partHeaderEnd);
    const partBody = trimmed.substring(partHeaderEnd + 4).replace(/\r\n--$/, "").trim();

    const partCtMatch = partHeaders.match(/Content-Type:\s*([^\r\n;]+)/i);
    const partCt = partCtMatch ? partCtMatch[1].trim().toLowerCase() : "";

    if (partCt === "text/html" && !html) {
      html = partBody;
    } else if (partCt === "text/plain" && !text) {
      text = partBody;
    }
  }

  return { text, html, subjectFromHeaders };
}
