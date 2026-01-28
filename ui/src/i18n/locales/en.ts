export const en = {
    brand: {
        title: "MOLTBOT",
        subtitle: "Gateway Dashboard"
    },
    sidebar: {
        expand: "Expand sidebar",
        collapse: "Collapse sidebar"
    },
    status: {
        health: "Health",
        ok: "OK",
        offline: "Offline",
        connected: "Connected",
        disconnected: "Disconnected"
    },
    nav: {
        resources: "Resources",
        docs: "Docs",
        group: {
            chat: "Chat",
            control: "Control",
            agent: "Agent",
            settings: "Settings"
        }
    },
    tab: {
        title: {
            overview: "Overview",
            channels: "Channels",
            instances: "Instances",
            sessions: "Sessions",
            cron: "Cron Jobs",
            skills: "Skills",
            nodes: "Nodes",
            chat: "Chat",
            config: "Config",
            debug: "Debug",
            logs: "Logs",
            control: "Control"
        },
        subtitle: {
            overview: "Gateway status, entry points, and a fast health read.",
            channels: "Manage channels and settings.",
            instances: "Presence beacons from connected clients and nodes.",
            sessions: "Inspect active sessions and adjust per-session defaults.",
            cron: "Schedule wakeups and recurring agent runs.",
            skills: "Manage skill availability and API key injection.",
            nodes: "Paired devices, capabilities, and command exposure.",
            chat: "Direct gateway chat session for quick interventions.",
            config: "Edit ~/.clawdbot/moltbot.json safely.",
            debug: "Gateway snapshots, events, and manual RPC calls.",
            logs: "Live tail of the gateway file logs."
        }
    },
    overview: {
        gateway_access: {
            title: "Gateway Access",
            sub: "Where the dashboard connects and how it authenticates."
        },
        snapshot: {
            title: "Snapshot",
            sub: "Latest gateway handshake information."
        },
        notes: {
            title: "Notes",
            sub: "Quick reminders for remote control setups.",
            tailscale: "Tailscale serve",
            tailscale_sub: "Prefer serve mode to keep the gateway on loopback with tailnet auth.",
            session: "Session hygiene",
            session_sub: "Use /new or sessions.patch to reset context.",
            cron: "Cron reminders",
            cron_sub: "Use isolated sessions for recurring runs."
        },
        field: {
            websocket: "WebSocket URL",
            token: "Gateway Token",
            password: "Password (not stored)",
            session: "Default Session Key",
            language: "Language"
        },
        stats: {
            uptime: "Uptime",
            tick: "Tick Interval",
            last_refresh: "Last Channels Refresh",
        },
        action: {
            connect: "Connect",
            refresh: "Refresh"
        },
        hint: {
            connect_apply: "Click Connect to apply connection changes.",
            use_channels: "Use Channels to link WhatsApp, Telegram, Discord, Signal, or iMessage.",
            auth_failed: "Auth failed. Re-copy a tokenized URL with `moltbot dashboard --no-open`, or update the token, then click Connect.",
            https_required: "This page is HTTP, so the browser blocks device identity. Use HTTPS (Tailscale Serve) or open http://127.0.0.1:18789 on the gateway host."
        }
    }
};
