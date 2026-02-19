const BASE_RISK = {
  "chat.respond": 5,
  "memory.read": 15,
  "memory.write": 25,
  "notes.create": 15,
  "notes.search": 10,
  "todos.create": 10,
  "todos.list": 5,
  "todos.createList": 5,
  "todos.listLists": 5,
  "todos.updateList": 5,
  "todos.update": 10,
  "todos.complete": 5,
  "meeting.summarize": 15,
  "calendar.proposeHold": 35,
  "email.draftReply": 25,
  "email.send": 70,
  "file.read": 20,
  "file.write": 50,
  "file.delete": 80,
  "system.modify": 90,
  "install.software": 90,
  "browser.navigate": 40,
  "api.external_post": 75,
  "action.run": 70,
  "desktop.run": 90,
  "desktop.launch": 85,
  "desktop.input": 80,
  "desktop.key": 80,
  "desktop.mouse": 80,
  "desktop.clipboard": 70,
  "desktop.screenshot": 75,
  "desktop.vision": 75,
  "desktop.uia": 85,
  "desktop.step": 90,
  "desktop.panic": 30,
  "messaging.slackPost": 70,
  "messaging.telegramSend": 40,
  "messaging.telegramVoiceSend": 40,
  "messaging.discordSend": 70,
  "messaging.whatsapp.send": 75,
  "messaging.sms.send": 75,
  "finance.transfer": 100,
  "finance.trade": 100
};

function baseRiskFor(actionType) {
  if (BASE_RISK[actionType] !== undefined) return BASE_RISK[actionType];
  if (String(actionType).startsWith("messaging.")) return 70;
  if (String(actionType).startsWith("file.")) return 50;
  if (String(actionType).startsWith("system.")) return 90;
  return 30;
}

export function scoreRisk({ actionType, sensitivity, outboundDomains = [], protectedPathHit = false, unknownDomain = false } = {}) {
  let score = baseRiskFor(actionType);
  const isMessaging = String(actionType).startsWith("messaging.");
  if (sensitivity?.phi) score += 20;
  if (sensitivity?.pii) score += 10;
  if (sensitivity?.secrets) score += 25;
  // Finance keywords in outbound messages shouldn't block replies.
  if (sensitivity?.finance && !isMessaging) score += 30;
  if (sensitivity?.system) score += 10;
  if (protectedPathHit) score += 15;
  if (unknownDomain) score += 15;
  if (outboundDomains.length > 3) score += 10;
  return Math.max(0, Math.min(100, score));
}
