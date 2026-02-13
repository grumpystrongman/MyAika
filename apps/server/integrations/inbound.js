import { createPairingRequest, isSenderAllowed, recordPairingUse } from "../storage/pairings.js";

async function callLocalChat(userText) {
  const port = process.env.PORT || 8790;
  const base = `http://127.0.0.1:${port}`;
  const resp = await fetch(`${base}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userText })
  });
  if (!resp.ok) {
    return { text: "I'm having trouble responding right now." };
  }
  return await resp.json();
}

export async function handleInboundMessage({ channel, senderId, senderName, text, workspaceId, reply }) {
  if (!senderId || !text) {
    return { status: "ignored" };
  }
  if (!isSenderAllowed(channel, senderId)) {
    const pairing = createPairingRequest({
      channel,
      senderId,
      senderName,
      workspaceId,
      preview: text.slice(0, 160)
    });
    if (typeof reply === "function") {
      await reply(`Pairing required. Use code ${pairing.code} in Aika to approve this channel.`);
    }
    return { status: "pairing_required", pairing };
  }

  recordPairingUse(channel, senderId);
  const response = await callLocalChat(text);
  if (response?.text && typeof reply === "function") {
    await reply(response.text);
  }
  return { status: "ok", response: response?.text || "" };
}
