# OpenAegis for Flowise

OpenAegis plugin package for Flowise.

## Install
1. Copy this package into your Flowise plugin directory or publish it as an npm package.
2. Configure the environment variables below.
3. Point Flowise plugin loader to `index.js`.

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
- Package name: `@openaegis/flowise-plugin`
- Pack command: `npm --prefix partners/openaegis-flowise pack`
- Publish command: `npm publish`

## Flowise Adapter
- Runtime adapter: `src/adapters/flowise/OpenAegisFlowiseNode.js`
- Schema: `src/adapters/flowise/flowise.node.json`
