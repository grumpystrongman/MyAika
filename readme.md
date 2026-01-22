# MyAika

Aika is a companion app with:
- a “mind” (chat + memory + identity) in `apps/server`
- a “body” (UI + renderer) in `apps/web`
- shared schemas in `packages/shared`

## Local dev
1) Install deps: `npm install`
2) Server env:
   - Copy `apps/server/.env.example` to `apps/server/.env`
   - Set `OPENAI_API_KEY=...`
3) Run:
   - `npm run dev:server`
   - `npm run dev:web`

Open:
- Web: http://localhost:3000
- Server health: http://localhost:8787/health
