module.exports = function normalizeJid(jid) {
  if (!jid) return jid;
  // Example: '201005095412:23@s.whatsapp.net' -> '201005095412@s.whatsapp.net'
  if (jid.includes(":")) {
    return jid.split(":")[0] + "@" + jid.split("@")[1];
  }
  return jid;
};
