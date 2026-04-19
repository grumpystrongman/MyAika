import { getAssistantProfile } from "../../storage/assistant_profile.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizePhone(value) {
  return normalizeText(value).replace(/[^\d+]/g, "");
}

function buildProfileContacts(userId = "local") {
  const profile = getAssistantProfile(userId);
  const preferences = profile?.preferences || {};
  const identity = preferences.identity || {};
  const contacts = Array.isArray(preferences.contacts) ? preferences.contacts : [];

  const catalog = [];

  catalog.push({
    name: "self",
    aliases: ["self", "me", "myself"],
    email: normalizeText(identity.personalEmail || identity.workEmail || ""),
    workEmail: normalizeText(identity.workEmail || ""),
    personalEmail: normalizeText(identity.personalEmail || ""),
    phone: normalizePhone(identity.phoneNumber || identity.smsNumber || identity.whatsappNumber || ""),
    sms: normalizePhone(identity.smsNumber || identity.phoneNumber || ""),
    whatsapp: normalizePhone(identity.whatsappNumber || identity.phoneNumber || ""),
    telegramChatId: normalizeText(identity.telegramChatId || "")
  });

  for (const entry of contacts) {
    if (!entry || typeof entry !== "object") continue;
    const aliases = Array.isArray(entry.aliases) ? entry.aliases.map(normalizeText).filter(Boolean) : [];
    catalog.push({
      name: normalizeText(entry.name || entry.label || ""),
      aliases,
      email: normalizeText(entry.email || ""),
      workEmail: normalizeText(entry.workEmail || ""),
      personalEmail: normalizeText(entry.personalEmail || ""),
      phone: normalizePhone(entry.phone || entry.phoneNumber || entry.sms || entry.whatsapp || ""),
      sms: normalizePhone(entry.sms || entry.phone || entry.phoneNumber || ""),
      whatsapp: normalizePhone(entry.whatsapp || entry.phone || entry.phoneNumber || ""),
      telegramChatId: normalizeText(entry.telegramChatId || entry.telegram || entry.chatId || ""),
      telegramUserId: normalizeText(entry.telegramUserId || "")
    });
  }

  return catalog.filter((entry) => entry.name || entry.aliases.length);
}

function findContact(catalog, lookup = "") {
  const key = normalizeKey(lookup);
  if (!key) return null;
  return catalog.find((entry) => {
    if (normalizeKey(entry.name) === key) return true;
    return (entry.aliases || []).some((alias) => normalizeKey(alias) === key);
  }) || null;
}

export function resolveEmailTarget({ userId = "local", alias = "", label = "" } = {}) {
  const catalog = buildProfileContacts(userId);
  const normalizedAlias = normalizeKey(alias);
  if (normalizedAlias === "work") {
    const self = findContact(catalog, "self");
    const value = normalizeText(self?.workEmail || "");
    return value ? { ok: true, value, contactName: "work", resolvedBy: "identity.workEmail" } : { ok: false };
  }
  if (normalizedAlias === "personal") {
    const self = findContact(catalog, "self");
    const value = normalizeText(self?.personalEmail || "");
    return value ? { ok: true, value, contactName: "personal", resolvedBy: "identity.personalEmail" } : { ok: false };
  }

  const lookup = label || alias;
  const entry = findContact(catalog, lookup);
  const value = normalizeText(entry?.email || entry?.personalEmail || entry?.workEmail || "");
  return value
    ? { ok: true, value, contactName: entry?.name || lookup, resolvedBy: entry?.name === "self" ? "identity.email" : "contacts.email" }
    : { ok: false };
}

export function resolveMessagingTarget({ userId = "local", platform = "", alias = "", label = "", context = {} } = {}) {
  const catalog = buildProfileContacts(userId);
  const normalizedPlatform = normalizeKey(platform);
  const normalizedAlias = normalizeKey(alias);

  if (normalizedPlatform === "telegram" && normalizedAlias === "self" && context?.chatId) {
    return { ok: true, value: String(context.chatId), contactName: "self", resolvedBy: "context.chatId" };
  }

  const lookup = label || alias;
  const entry = findContact(catalog, lookup);
  if (!entry) return { ok: false };

  if (normalizedPlatform === "telegram") {
    const value = normalizeText(entry.telegramChatId || entry.telegramUserId || "");
    return value ? { ok: true, value, contactName: entry.name || lookup, resolvedBy: entry.name === "self" ? "identity.telegramChatId" : "contacts.telegramChatId" } : { ok: false };
  }

  if (normalizedPlatform === "whatsapp") {
    const value = normalizePhone(entry.whatsapp || entry.phone || "");
    return value ? { ok: true, value, contactName: entry.name || lookup, resolvedBy: entry.name === "self" ? "identity.whatsappNumber" : "contacts.whatsapp" } : { ok: false };
  }

  if (normalizedPlatform === "sms") {
    const value = normalizePhone(entry.sms || entry.phone || "");
    return value ? { ok: true, value, contactName: entry.name || lookup, resolvedBy: entry.name === "self" ? "identity.smsNumber" : "contacts.sms" } : { ok: false };
  }

  return { ok: false };
}
