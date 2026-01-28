export const ptBR = {
    brand: {
        title: "MOLTBOT",
        subtitle: "Painel do Gateway"
    },
    sidebar: {
        expand: "Expandir barra lateral",
        collapse: "Recolher barra lateral"
    },
    status: {
        health: "Saúde",
        ok: "OK",
        offline: "Offline",
        connected: "Conectado",
        disconnected: "Desconectado"
    },
    nav: {
        resources: "Recursos",
        docs: "Documentação",
        group: {
            chat: "Chat",
            control: "Controle",
            agent: "Agente",
            settings: "Configurações"
        }
    },
    tab: {
        title: {
            overview: "Visão Geral",
            channels: "Canais",
            instances: "Instâncias",
            sessions: "Sessões",
            cron: "Tarefas Cron",
            skills: "Skills",
            nodes: "Nós",
            chat: "Chat",
            config: "Configuração",
            debug: "Depuração",
            logs: "Logs",
            control: "Controle"
        },
        subtitle: {
            overview: "Status do gateway e leitura rápida de saúde.",
            channels: "Gerenciar canais e configurações.",
            instances: "Beacons de presença de clientes e nós conectados.",
            sessions: "Inspecionar sessões ativas e ajustar padrões.",
            cron: "Agendar despertares e execuções recorrentes de agentes.",
            skills: "Gerenciar disponibilidade de skills e chaves de API.",
            nodes: "Dispositivos pareados, capacidades e exposição de comandos.",
            chat: "Sessão de chat direta com o gateway para intervenções rápidas.",
            config: "Editar ~/.clawdbot/moltbot.json com segurança.",
            debug: "Snapshots do gateway, eventos e chamadas RPC manuais.",
            logs: "Acompanhamento em tempo real dos logs do gateway."
        }
    },
    overview: {
        gateway_access: {
            title: "Acesso ao Gateway",
            sub: "Onde o painel se conecta e como se autentica."
        },
        snapshot: {
            title: "Snapshot",
            sub: "Informações mais recentes do handshake do gateway."
        },
        notes: {
            title: "Notas",
            sub: "Lembretes rápidos para configurações de controle remoto.",
            tailscale: "Tailscale serve",
            tailscale_sub: "Prefira o modo serve para manter o gateway em loopback com autenticação tailnet.",
            session: "Higiene de sessão",
            session_sub: "Use /new ou sessions.patch para redefinir o contexto.",
            cron: "Lembretes do Cron",
            cron_sub: "Use sessões isoladas para execuções recorrentes."
        },
        field: {
            websocket: "URL do WebSocket",
            token: "Token do Gateway",
            password: "Senha (não armazenada)",
            session: "Chave de Sessão Padrão",
            language: "Idioma"
        },
        stats: {
            uptime: "Tempo de Atividade",
            tick: "Intervalo de Tick",
            last_refresh: "Última Atualização de Canais",
        },
        action: {
            connect: "Conectar",
            refresh: "Atualizar"
        },
        hint: {
            connect_apply: "Clique em Conectar para aplicar as alterações.",
            use_channels: "Use Canais para vincular WhatsApp, Telegram, Discord, Signal ou iMessage.",
            auth_failed: "Falha na autenticação. Copie novamente uma URL tokenizada com `moltbot dashboard --no-open`, ou atualize o token, depois clique em Conectar.",
            https_required: "Esta página é HTTP, então o navegador bloqueia a identidade do dispositivo. Use HTTPS (Tailscale Serve) ou abra http://127.0.0.1:18789 no host do gateway."
        }
    }
};
