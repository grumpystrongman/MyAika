# QA Checklist

## Server
- [ ] `npm run dev:server` starts without errors
- [ ] `/health` returns 200
- [ ] `/api/status` returns 200

## MCP-lite
- [ ] `/api/tools` lists tools
- [ ] `/api/tools/call` works for `meeting.summarize`
- [ ] Approval flow works for `email.send` (approve + execute)
- [ ] `/api/approvals` lists pending/approved items

## UI
- [ ] Features tab loads services/tools without errors
- [ ] Features ? Refresh updates tool list
- [ ] Features ? Try button opens Tools tab with prefilled tool
- [ ] Tools tab can call a tool and show result
- [ ] Approvals list shows pending items and execute works

## Audio/Avatar
- [ ] Piper voice plays
- [ ] Live2D renders and lip-sync moves with audio

