# OpenAegis Partner Plugin Pack

## Goal
Package OpenAegis as a reusable plugin for open-source host applications so adoption can grow through host ecosystems.

This repo now includes:
- A partner-host registry: `config/openaegis_partner_hosts.json`
- A scaffold command that generates plugin manifests under `data/plugins/<pluginId>/manifest.json`
- A package scaffold under `partners/<pluginId>/` so each host plugin is distributable.
- Adoption tracking and weekly summary commands.

## Quick Start
Generate manifests for all configured hosts:

```bash
npm run plugins:openaegis:seed
```

Generate only OpenClaw:

```bash
npm run plugins:openaegis:seed:openclaw
```

Package OpenClaw as a publishable `.tgz`:

```bash
npm run plugins:openaegis:pack:openclaw
```

Dry-run:

```bash
node apps/server/scripts/openaegis_partner_plugins.js --dry-run
```

## How It Works
1. Edit `config/openaegis_partner_hosts.json` and define each host.
2. Run the seed command to scaffold host-specific manifests and package directories.
3. Verify manifests with:
   - `GET /api/plugins`
   - `GET /api/plugins/:id`
4. Build distributable tarballs with `npm run plugins:openaegis:pack -- --host <hostId>`.
5. Use each generated plugin package as the source of truth for host-specific publishing.

## Host Registry Fields
- `id`: stable host slug.
- `name`: display name.
- `pluginId`: id used for `data/plugins/<pluginId>`.
- `status`: `prototype` or `planned`.
- `integrationType`: how the host integration is expected to work.
- `permissions` / `capabilities`: added to the generated manifest.
- `packageName`: npm package name for host distribution.
- `targets`: weekly adoption goals for installs, activations, retention.

## Adoption Tracking
Record events:

```bash
npm run plugins:openaegis:adoption:record -- --plugin openaegis-openclaw --event install --workspace acme-prod
npm run plugins:openaegis:adoption:record -- --plugin openaegis-openclaw --event activate --workspace acme-prod
```

Weekly summary:

```bash
npm run plugins:openaegis:adoption:weekly
```

JSON report:

```bash
npm run plugins:openaegis:adoption:weekly -- --json
```

Dashboard API endpoint (admin token required):

```bash
GET /api/plugins/adoption/weekly
GET /api/plugins/adoption/weekly?pluginId=openaegis-openclaw
GET /api/plugins/adoption/weekly?hostId=openclaw&format=text
```

## Adoption Workflow
1. Start with `openaegis-openclaw` and ship quickly.
2. Collect host install friction and activation metrics.
3. Prioritize next hosts by conversion and maintenance cost.
4. Keep all host metadata centralized in `config/openaegis_partner_hosts.json`.
