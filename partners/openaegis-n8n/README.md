# OpenAegis for n8n

OpenAegis plugin package for n8n.

## Install
1. Copy this package into your n8n plugin directory or publish it as an npm package.
2. Configure the environment variables below.
3. Point n8n plugin loader to `index.js`.

## Environment
- `OPENAEGIS_BASE_URL` (required): OpenAegis API base URL.
- `OPENAEGIS_API_KEY` (required): API key for OpenAegis endpoints.
- `OPENAEGIS_TIMEOUT_MS` (optional): HTTP timeout in milliseconds (default `20000`).

## Capabilities
- `chat`
- `module-execution`
- `runbooks`
- `watchtower`

## Quick Check
```bash
node ./src/index.js --self-check
```

## Distribution
- Package name: `@openaegis/n8n-plugin`
- Pack command: `npm --prefix partners/openaegis-n8n pack`
- Publish command: `npm publish`

## n8n Community Node Shape
- Node: `nodes/OpenAegis/OpenAegis.node.js`
- Credentials: `credentials/OpenAegisApi.credentials.js`
- Package metadata includes an `n8n` block.
