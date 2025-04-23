# ation-demo

Hatchet web UI is on http://localhost:8888
Default credentials: `admin@example.com` / `Admin123!!`
Docs: https://docs.hatchet.run/self-hosting/hatchet-lite

On first run you need to login and create API token here: http://localhost:8888/v1/tenant-settings/api-tokens
You can also opt out of analytics here: http://localhost:8888/v1/tenant-settings/overview

Put it into your `.env` file. `tsx` and the Hatchet SDK will pick it up automatically:

```
HATCHET_CLIENT_TLS_STRATEGY=none
HATCHET_CLIENT_TOKEN=...
```

Let's run it:

```bash
docker compose up

# in another terminal
npm install -g pnpm
pnpm install
pnpm dev
```

Use the Hatchet web UI to interact with the agent.
