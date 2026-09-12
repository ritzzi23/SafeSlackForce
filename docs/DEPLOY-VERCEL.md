# Hosting the dashboard on Vercel

The dashboard is a static Vite build, so it deploys to Vercel as is. The API cannot run on Vercel:
it holds a Slack Socket Mode WebSocket open, runs a notification pump every second, and keeps
SQLite on local disk. Serverless functions support none of these. So the API stays on the demo laptop
behind a tunnel, and Vercel proxies `/api` and `/health` to it. The browser only sees one origin,
so the pairing cookie and the event stream work unchanged.

## Steps (about 5 minutes)

1. Start the API on the laptop: `npm run start:api`
2. Open a tunnel to it: `brew install cloudflared && cloudflared tunnel --url http://127.0.0.1:4100`
   Copy the `https://<random>.trycloudflare.com` URL it prints.
3. In `vercel.json`, replace both `REPLACE-WITH-API-TUNNEL.trycloudflare.com` with that host.
4. Import the repo in Vercel with the repository root as Root Directory. `vercel.json` sets install,
   build and output. Node 22.
5. In `.env` on the laptop, allow both dashboards and point Slack links at the hosted one:
   `FRONTEND_ORIGIN=http://localhost:5173,https://<project>.vercel.app`
   `DASHBOARD_URL=https://<project>.vercel.app`
   Restart the API.
6. Open the Vercel URL, pair with `DASHBOARD_TOKEN`.

## Notes

- A quick tunnel URL changes on every restart. Update `vercel.json` and redeploy if it does.
- If the API or tunnel is down, the hosted page still loads and falls back to the standalone preview.
- Long-lived event streams through a proxy can be cut. The dashboard reconnects and the API replays
  from the last cursor, so no update is lost.
- No secrets go to Vercel. Every key stays in the laptop's `.env`.
