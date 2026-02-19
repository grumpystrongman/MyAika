import { z } from "zod";

export const policySchema = z.object({
  autonomy_level: z.enum(["assistive_only", "supervised", "autonomous"]).default("supervised"),
  risk_threshold: z.number().min(0).max(100).default(60),
  allow_actions: z.array(z.string()).default([]),
  requires_approval: z.array(z.string()).default([]),
  protected_paths: z.array(z.string()).default([]),
  network_rules: z.object({
    allowlist_domains: z.array(z.string()).default([]),
    blocklist_domains: z.array(z.string()).default([]),
    require_approval_for_new_domains: z.boolean().default(true),
    block_uploads_to_unknown: z.boolean().default(true)
  }).default({}),
  memory_tiers: z.object({
    tier0: z.object({
      label: z.string().default("ephemeral"),
      allow_write: z.boolean().default(true),
      allow_read: z.boolean().default(true)
    }).default({}),
    tier1: z.object({
      label: z.string().default("personal"),
      allow_write: z.boolean().default(true),
      allow_read: z.boolean().default(true)
    }).default({}),
    tier2: z.object({
      label: z.string().default("professional"),
      allow_write: z.boolean().default(true),
      allow_read: z.boolean().default(true)
    }).default({}),
    tier3: z.object({
      label: z.string().default("encrypted"),
      allow_write: z.boolean().default(true),
      allow_read: z.boolean().default(true)
    }).default({}),
    tier4: z.object({
      label: z.string().default("PHI_readonly"),
      allow_write: z.boolean().default(false),
      allow_read: z.boolean().default(true)
    }).default({})
  }).default({}),
  absolute_prohibitions: z.array(z.string()).default([]),
  kill_switch: z.object({
    enabled: z.boolean().default(false),
    stop_phrase: z.string().default("Aika, stand down.")
  }).default({}),
  logging: z.object({
    retention_days: z.number().min(1).default(30),
    redaction: z.object({
      enabled: z.boolean().default(true),
      patterns: z.array(z.string()).default([])
    }).default({}),
    include_hash_chain: z.boolean().default(true)
  }).default({})
}).strict();

export const defaultPolicy = policySchema.parse({
  autonomy_level: "supervised",
  risk_threshold: 60,
  allow_actions: [
    "chat.respond",
    "memory.read",
    "memory.write",
    "notes.create",
    "notes.search",
    "todos.create",
    "todos.list",
    "todos.createList",
    "todos.listLists",
    "todos.updateList",
    "todos.update",
    "todos.complete",
    "meeting.summarize",
    "calendar.proposeHold",
    "email.draftReply",
    "email.convertToTodo",
    "email.scheduleFollowUp",
    "email.replyWithContext",
    "email.sendWithContext",
    "email.send",
    "spreadsheet.applyChanges",
    "memory.search",
    "memory.rotateKey",
    "integrations.plexIdentity",
    "integrations.firefliesTranscripts",
    "integrations.fireflies.sync",
    "weather.current",
    "web.search",
    "shopping.productResearch",
    "shopping.amazonAddToCart",
    "messaging.slackPost",
    "messaging.telegramSend",
    "messaging.telegramVoiceSend",
    "messaging.discordSend",
    "messaging.whatsapp.send",
    "messaging.sms.send",
    "desktop.run",
    "desktop.launch",
    "desktop.input",
    "desktop.key",
    "desktop.mouse",
    "desktop.clipboard",
    "desktop.screenshot",
    "desktop.vision",
    "desktop.uia",
    "desktop.step",
    "desktop.panic",
    "action.run",
    "skill.vault.run",
    "browser.navigate",
    "api.external_post",
    "file.read",
    "file.write",
    "file.delete",
    "system.modify",
    "install.software",
    "audit.view",
    "approvals.view",
    "kill_switch.enable",
    "kill_switch.disable"
  ],
  requires_approval: [
    "email.send",
    "email.sendWithContext",
    "file.delete",
    "system.modify",
    "install.software",
    "api.external_post",
    "messaging.slackPost",
    "messaging.telegramSend",
    "messaging.discordSend",
    "messaging.whatsapp.send",
    "messaging.sms.send",
    "desktop.run",
    "desktop.launch",
    "desktop.input",
    "desktop.key",
    "desktop.mouse",
    "desktop.clipboard",
    "desktop.screenshot",
    "desktop.vision",
    "desktop.uia",
    "desktop.step",
    "finance.transfer",
    "finance.trade",
    "kill_switch.disable"
  ],
  protected_paths: [
    "C:\\\\Windows\\\\*",
    "C:\\\\Program Files\\\\*",
    "C:\\\\Program Files (x86)\\\\*",
    "C:\\\\Users\\\\*\\\\AppData\\\\*",
    "/etc/*",
    "/bin/*",
    "/usr/*",
    "/var/*",
    "apps/server/src/safety/*",
    "config/policy.json"
  ],
  network_rules: {
    allowlist_domains: [
      "localhost",
      "127.0.0.1",
      "api.telegram.org",
      "slack.com",
      "discord.com"
    ],
    blocklist_domains: [
      "pastebin.com",
      "paste.ee",
      "gist.github.com",
      "ghostbin.com",
      "hastebin.com"
    ],
    require_approval_for_new_domains: true,
    block_uploads_to_unknown: true
  },
  memory_tiers: {
    tier0: { label: "ephemeral", allow_write: true, allow_read: true },
    tier1: { label: "personal", allow_write: true, allow_read: true },
    tier2: { label: "professional", allow_write: true, allow_read: true },
    tier3: { label: "encrypted", allow_write: true, allow_read: true },
    tier4: { label: "PHI_readonly", allow_write: false, allow_read: true }
  },
  absolute_prohibitions: [
    "self.modify_safety",
    "disable.logging",
    "store.plaintext_credentials",
    "bypass.2fa",
    "browser.password_store",
    "finance.transfer",
    "finance.trade"
  ],
  kill_switch: { enabled: false, stop_phrase: "Aika, stand down." },
  logging: {
    retention_days: 30,
    redaction: {
      enabled: true,
      patterns: [
        "api[_-]?key\\s*[:=]\\s*[^\\s]+",
        "secret\\s*[:=]\\s*[^\\s]+",
        "token\\s*[:=]\\s*[^\\s]+",
        "password\\s*[:=]\\s*[^\\s]+"
      ]
    },
    include_hash_chain: true
  }
});
