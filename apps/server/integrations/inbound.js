import { createPairingRequest, isSenderAllowed, recordPairingUse } from "../storage/pairings.js";
import { tryHandleRemoteCommand } from "./remoteCommands.js";
import { ensureActiveThread } from "../storage/threads.js";

async function callLocalChat({ userText, threadId, ragModel, channel, senderId, senderName } = {}) {
  const port = process.env.PORT || 8790;
  const base = `http://127.0.0.1:${port}`;
  const resp = await fetch(`${base}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userText,
      threadId,
      ragModel,
      channel,
      senderId,
      senderName
    })
  });
  if (!resp.ok) {
    return { text: "I'm having trouble responding right now." };
  }
  return await resp.json();
}

export async function handleInboundMessage({ channel, senderId, senderName, text, workspaceId, chatId, reply }) {
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
  const commandResult = await tryHandleRemoteCommand({ channel, senderId, senderName, chatId, text });
  if (commandResult?.handled) {
    if (commandResult.response && typeof reply === "function") {
      await reply(commandResult.response);
    }
    return { status: "ok", response: commandResult.response || "", command: true };
  }
  const thread = ensureActiveThread({
    channel,
    senderId,
    chatId,
    senderName,
    workspaceId
  });
  const response = await callLocalChat({
    userText: text,
    threadId: thread?.id || null,
    ragModel: thread?.rag_model || "auto",
    channel,
    senderId,
    senderName
  });
  if (response?.text && typeof reply === "function") {
    await reply(response.text);
  }
  return { status: "ok", response: response?.text || "" };
}