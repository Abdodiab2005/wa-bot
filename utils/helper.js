function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatWhatsappToTelegram(text) {
  const escaped = escapeHtml(text);

  return escaped
    .replace(/\*([^*]+)\*/g, "<b>$1</b>")
    .replace(/_([^_]+)_/g, "<i>$1</i>")
    .replace(/~([^~]+)~/g, "<s>$1</s>")
    .replace(/```([^`]+)```/gs, "<pre><code>$1</code></pre>")
    .replace(/^&gt; (.+)/gm, "<blockquote>$1</blockquote>");
}

module.exports = { formatWhatsappToTelegram };
