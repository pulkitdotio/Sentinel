# Sentinel frontend

## Local realtime verification

Start the API, scheduler, at least one regional probe worker, and the incident worker from `backend/` in separate terminals. Then start the frontend from `frontend/`.

```powershell
# backend API
npm run dev

# backend scheduler
npm run dev:scheduler

# backend probe worker (PowerShell)
$env:PROBE_REGION='mumbai'
npm run dev:probe

# backend incident worker
npm run dev:incident

# frontend
npm run dev
```

In Command Prompt, set the probe region with `set PROBE_REGION=mumbai` before running `npm run dev:probe`.

Sign in and confirm the app shell changes from **Reconnecting** to **Live**. Open a monitor and leave its Overview or Checks page visible. As checks complete, current metrics and recent checks should update without a page reload. Stop the API briefly to confirm the shell reports **Reconnecting** or **Realtime offline** while the existing REST-rendered UI remains usable; restart it and confirm the visible data reconciles after **Live** returns. Signing out should end the connection.

Socket.IO is a freshness signal only. MongoDB and the REST APIs remain authoritative, so a missed event is reconciled by normal REST navigation or the bounded refresh performed after reconnection.
