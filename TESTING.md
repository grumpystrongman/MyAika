# Aika Tools v1 - Manual Test Plan

## Start
- Terminal 1: `npm run dev:server`
- Terminal 2: `npm run dev:web`
- Open `http://localhost:3000`

## Automated smoke (recommended)
- `npm run smoke`
- Requires Playwright browsers: `npx playwright install`

## UI smoke checks (Aika Tools tab)
1) Meetings
   - Paste a short transcript, click **Summarize & Store**
   - Verify response contains `googleDocUrl` and `markdownPath` when Google is connected
2) Notes
   - Create note, then search by keyword
   - Verify result list shows snippet and Google Doc link
3) Todos
   - Create a todo, then list todos
4) Calendar
   - Propose a hold (draft only)
5) Email
   - Draft reply, then attempt send
   - Verify approval required and appears in Tools -> Approvals
6) Spreadsheet
   - Apply changes with JSON ops
   - Verify diff/patch response and Google Doc link if connected
7) Memory
   - Write Tier 1 entry and search
   - Write Tier 3 entry and search (should not show plaintext in Google Docs)
8) Integrations
   - Plex Identity (stub)
   - Fireflies Transcripts (stub)
9) Messaging
   - Queue a Slack message (approval required)
   - Approve + Execute in Tools tab

## Meeting Copilot checks (Recordings tab)
1) Click **Start recording** (header or Recordings tab)
2) Speak for 5-10 seconds, then click **Stop**
3) Verify a new recording appears in the list with status **processing** then **ready**
4) Open the recording and verify:
   - Transcript tab shows text (or mock text if no provider key)
   - Summary tab shows overview/decisions/tasks/risks/next steps
   - Tasks tab allows edit + Save
5) Ask this meeting: enter a question and verify a response
6) Ask across meetings: enter a cross-meeting question and verify a response
7) Actions tab: click **Draft recap email** or **Create recap doc** and verify output

## CLI smoke checks
Run from repo root:
- `node apps/server/cli/aika.js run notes.create --json "{\"title\":\"Test\",\"body\":\"Hello\",\"tags\":[\"demo\"],\"store\":{\"googleDocs\":false,\"localMarkdown\":true}}"`
- `node apps/server/cli/aika.js run notes.search --json "{\"query\":\"Hello\",\"limit\":10}"`
- `node apps/server/cli/aika.js run meeting.summarize --json "{\"transcript\":\"Alice: kickoff\\nBob: action items\",\"store\":{\"googleDocs\":false,\"localMarkdown\":true}}"`
- `node apps/server/cli/aika.js run email.draftReply --json \"{\\\"originalEmail\\\":{\\\"from\\\":\\\"a@b.com\\\",\\\"to\\\":[\\\"me@x.com\\\"],\\\"subject\\\":\\\"Hello\\\",\\\"body\\\":\\\"Test\\\"},\\\"tone\\\":\\\"friendly\\\"}\"`
- `node apps/server/cli/aika.js run email.send --json \"{\\\"draftId\\\":\\\"<paste-id>\\\"}\"`
- `node apps/server/cli/aika.js approvals list`
- `node apps/server/cli/aika.js approvals approve <approvalId>`
- `node apps/server/cli/aika.js approvals deny <approvalId>`

## Expected
- Approvals required for email.send and messaging tools
- Tool history available at `GET /api/tools/history`
- Tier 3 memory stored encrypted locally and in Google Docs
