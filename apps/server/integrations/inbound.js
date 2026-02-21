import { createPairingRequest, isSenderAllowed, recordPairingUse } from "../storage/pairings.js";
import { tryHandleRemoteCommand } from "./remoteCommands.js";
import { ensureActiveThread } from "../storage/threads.js";
import { getAssistantProfile } from "../storage/assistant_profile.js";

async function callLocalChat({ userText, threadId, ragModel, channel, senderId, senderName, chatId } = {}) {
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
      senderName,
      chatId
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
      await reply(`Pairing required. Use code ${pairing.code} in Aika to approve this channel.`, { kind: "pairing" });
    }
    return { status: "pairing_required", pairing };
  }

  recordPairingUse(channel, senderId);
  const commandResult = await tryHandleRemoteCommand({ channel, senderId, senderName, chatId, text });
  if (commandResult?.handled) {
    if (commandResult.response && typeof reply === "function") {
      await reply(commandResult.response, { kind: "command" });
    }
    return { status: "ok", response: commandResult.response || "", command: true };
  }
  const profile = getAssistantProfile("local");
  const defaultRag = profile?.preferences?.rag?.defaultModel || "auto";
  const thread = ensureActiveThread({
    channel,
    senderId,
    chatId,
    senderName,
    workspaceId,
    ragModel: defaultRag
  });
  const response = await callLocalChat({
    userText: text,
    threadId: thread?.id || null,
    ragModel: thread?.rag_model || defaultRag,
    channel,
    senderId,
    senderName,
    chatId
  });
  if (response?.text && typeof reply === "function") {
    await reply(response.text, { kind: "chat" });
  }
  return { status: "ok", response: response?.text || "" };
}
