import { Client, GatewayIntentBits, Partials } from "discord.js";
import { handleInboundMessage } from "./inbound.js";

let clientInstance = null;

export function startDiscordBot() {
  const token = process.env.DISCORD_BOT_TOKEN || "";
  if (!token) return { ok: false, reason: "discord_token_missing" };
  if (clientInstance) return { ok: true, status: "running" };

  clientInstance = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel]
  });

  clientInstance.on("messageCreate", async (message) => {
    try {
      if (!message || message.author?.bot) return;
      const senderId = message.author?.id;
      const senderName = message.author?.username || "";
      const text = message.content || "";
      await handleInboundMessage({
        channel: "discord",
        senderId,
        senderName,
        text,
        workspaceId: "default",
        chatId: message.channel?.id || "",
        reply: async (replyText) => {
          await message.reply(replyText);
        }
      });
    } catch {
      // ignore
    }
  });

  clientInstance.login(token).catch(() => {});
  return { ok: true, status: "starting" };
}
