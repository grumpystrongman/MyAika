# Contact Resolution Phase 8

## Scope
- Add server-side contact resolution for outbound email, SMS, WhatsApp, and Telegram actions.
- Support self aliases and saved contact names without requiring raw phone numbers or chat IDs in every request.

## Implemented
- Added `apps/server/src/agent/contactResolution.js`
- Extended `assistant_profile` defaults with:
  - `preferences.identity.phoneNumber`
  - `preferences.identity.smsNumber`
  - `preferences.identity.whatsappNumber`
  - `preferences.identity.telegramChatId`
  - `preferences.contacts[]`
- Updated `intentRouter` to capture messaging recipient labels for:
  - Telegram
  - WhatsApp
  - SMS / text
- Updated `actionPipeline` to resolve:
  - email aliases and named contacts
  - SMS self and named contacts
  - WhatsApp self and named contacts
  - Telegram self and named contacts

## Behavior
- `Text me "Ping"` resolves against identity phone settings when present.
- `Send WhatsApp to Sarah "On my way"` resolves against `preferences.contacts`.
- `Send Telegram to Nina "Ping me"` resolves against `preferences.contacts[].telegramChatId`.
- Missing saved targets now return concrete guidance instead of a generic missing-parameter prompt.

## Validation
- `apps/server/tests/agent_actions.test.js`
- Messaging resolution verified for:
  - self SMS
  - named WhatsApp contact
  - missing Telegram contact target
