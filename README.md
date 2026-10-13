# Ironscales MCP Server

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

A Model Context Protocol (MCP) server for Ironscales email security. Enables AI assistants to investigate phishing incidents, manage email classification, execute remediations, and view security statistics.

This is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that connects Claude (or any MCP-compatible AI) to your Ironscales environment.

> **Part of the [MSP Claude Plugins](https://github.com/WYRE-AI) ecosystem** — a growing suite of AI integrations for the MSP stack. Built by MSPs, for MSPs.

## Interactive Incident Card (MCP Apps)

`ironscales_incidents_get` renders as an interactive card in MCP Apps hosts
(Claude Desktop/web) showing the phishing incident's subject, status, severity,
sender, affected recipients, and threat indicators; plain-JSON behavior is
unchanged in other hosts. The card is read-only — remediation stays with the
model-driven remediation tools. It is neutral by default and brandable via
`window.__BRAND__` injection or `MCP_BRAND_*` env vars (`MCP_BRAND_NAME`,
`MCP_BRAND_LOGO_URL`, `MCP_BRAND_PRIMARY_COLOR`, `MCP_BRAND_ACCENT_COLOR`,
`MCP_BRAND_BG`, `MCP_BRAND_TEXT`) — no rebuild needed.

## Installation

```bash
npm install @wyre-ai/ironscales-mcp
```

## Configuration

Copy [`.env.example`](.env.example) and set the variables below.

| Variable | Required | Description |
|----------|----------|-------------|
| `IRONSCALES_API_KEY` | For stdio and `AUTH_MODE=env` | Ironscales API key |
| `IRONSCALES_COMPANY_ID` | For stdio and `AUTH_MODE=env` | Ironscales company ID |
| `MCP_TRANSPORT` | No | `stdio` (default) or `http` |
| `AUTH_MODE` | No | `gateway` (Docker image and Compose) or `env`. Gateway mode requires `X-Ironscales-API-Key` and `X-Ironscales-Company-ID` on each `/mcp` request and never falls back to `IRONSCALES_*`. `env` uses those variables only after S2S auth succeeds. Unset means `env` (stdio and single-tenant HTTP). |
| `CONDUIT_S2S_SECRET` | Yes for HTTP | Service-to-service secret. The HTTP server logs an error and exits non-zero when this is empty or a known placeholder (`changeme`, `secret`, `replace-me`, `replace-with-a-real-secret`, and the other example values). Generate one with `openssl rand -hex 32`. Compose will not start without it. The value is never logged. |
| `MCP_ALLOW_INSECURE_DEV` | No | Set to exactly `1` only for local development to start HTTP without `CONDUIT_S2S_SECRET`. The process logs a warning, does not enforce `X-Gateway-S2S`, and binds `127.0.0.1` only. A non-loopback `MCP_HTTP_HOST` refuses to start. A known placeholder secret still refuses to start. |
| `MCP_HTTP_HOST` | No | Bind address when a real `CONDUIT_S2S_SECRET` is set. Unset keeps `0.0.0.0`, the historical container bind. The image and Compose set `0.0.0.0` inside the container. |
| `MCP_HTTP_PORT` | No | HTTP port. Defaults to `8080`. |

`/health` and `/healthz` stay unauthenticated and do not read credentials. The stdio transport does not use `CONDUIT_S2S_SECRET`.

### HTTP authentication

With `MCP_TRANSPORT=http` and `CONDUIT_S2S_SECRET` set, every `/mcp` request must include `X-Gateway-S2S`. The check is `verifyS2sHeader` in [`src/s2s-verify.ts`](src/s2s-verify.ts): the header value is `t=<unix seconds>,v1=<hex>`, where the hex is HMAC-SHA256 of the literal string `t=<unix seconds>` keyed with `CONDUIT_S2S_SECRET` (64 lowercase hex characters). The timestamp must be within 300 seconds of the server clock. A missing or invalid header is HTTP 401, before vendor credentials are read.

```bash
TS=$(date +%s)
SIG=$(printf 't=%s' "$TS" | openssl dgst -sha256 -hmac "$CONDUIT_S2S_SECRET" -hex | awk '{print $NF}')
curl -sS http://127.0.0.1:8080/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "X-Gateway-S2S: t=${TS},v1=${SIG}" \
  -H "X-Ironscales-API-Key: $IRONSCALES_API_KEY" \
  -H "X-Ironscales-Company-ID: $IRONSCALES_COMPANY_ID" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

In `AUTH_MODE=gateway`, `/mcp` also requires `X-Ironscales-API-Key` and `X-Ironscales-Company-ID`. Those headers are the only credential source for that request. `AUTH_MODE=env` still requires the signed `X-Gateway-S2S` header, then uses `IRONSCALES_API_KEY` and `IRONSCALES_COMPANY_ID` from the environment.

## Usage

### Running with Claude Desktop

Add to your Claude Desktop `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ironscales-mcp": {
      "command": "npx",
      "args": ["@wyre-ai/ironscales-mcp"],
      "env": {
        "IRONSCALES_API_KEY": "your-ironscales-api-key"
        "IRONSCALES_COMPANY_ID": "your-ironscales-company-id"
      }
    }
  }
}
```

### Running with Claude Code (CLI)

```bash
claude mcp add ironscales-mcp \
  -e IRONSCALES_API_KEY=your-value \
  -e IRONSCALES_COMPANY_ID=your-value \
  -- npx -y @wyre-ai/ironscales-mcp
```

### Docker

The image listens on `0.0.0.0` inside the container (`MCP_HTTP_HOST`) and defaults to `AUTH_MODE=gateway`. Publish the port on loopback and pass a real S2S secret. In gateway mode, Ironscales credentials arrive on each request as headers; they are not read from the environment.

```bash
docker build -t ironscales-mcp .
docker run \
  -e CONDUIT_S2S_SECRET=your-s2s-secret \
  -p 127.0.0.1:8080:8080 \
  ironscales-mcp
```

Compose refuses to start when `CONDUIT_S2S_SECRET` is unset. The gateway service sets `AUTH_MODE=gateway`, does not inject `IRONSCALES_API_KEY` or `IRONSCALES_COMPANY_ID`, and publishes `127.0.0.1:8080:8080`:

```bash
CONDUIT_S2S_SECRET=your-s2s-secret docker compose up
```

Single-tenant HTTP (`AUTH_MODE=env`) still requires the S2S secret, then uses `IRONSCALES_API_KEY` and `IRONSCALES_COMPANY_ID`. It is separate from the gateway Compose service above.

```bash
docker run \
  -e CONDUIT_S2S_SECRET=your-s2s-secret \
  -e AUTH_MODE=env \
  -e IRONSCALES_API_KEY=your-value \
  -e IRONSCALES_COMPANY_ID=your-value \
  -p 127.0.0.1:8080:8080 \
  ironscales-mcp
```

Local HTTP without a secret is development-only. It binds `127.0.0.1` and logs a warning. A non-loopback `MCP_HTTP_HOST` (including the image default `0.0.0.0`) makes startup exit:

```bash
MCP_TRANSPORT=http MCP_HTTP_HOST=127.0.0.1 MCP_ALLOW_INSECURE_DEV=1 npm run start:http
```

## Available Domains

### Allowlist
Manage email allowlists and blocklists

### Email
Email investigation and classification

### Incidents
Phishing incident management and triage

### Remediation
Execute email remediations and quarantine

### Stats
Security statistics and reporting


## Development

```bash
# Clone the repository
git clone https://github.com/WYRE-AI/ironscales-mcp.git
cd ironscales-mcp

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) if present, or open an issue to discuss changes.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.
