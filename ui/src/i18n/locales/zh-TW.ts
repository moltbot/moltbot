/**
 * Traditional Chinese (Taiwan) translations
 * 繁體中文（台灣）翻譯
 *
 * 翻譯原則：
 * - 使用台灣常見的軟體用語
 * - 保持專業但親切的語氣
 * - 技術名詞保留英文或使用約定俗成的翻譯
 * - 品牌名稱（WhatsApp、Telegram 等）不翻譯
 */
export const zhTW = {
  // 通用
  common: {
    loading: "載入中…",
    refresh: "重新整理",
    save: "儲存",
    saving: "儲存中…",
    apply: "套用",
    applying: "套用中…",
    cancel: "取消",
    delete: "刪除",
    edit: "編輯",
    close: "關閉",
    yes: "是",
    no: "否",
    ok: "確定",
    error: "錯誤",
    success: "成功",
    warning: "警告",
    info: "資訊",
    enabled: "已啟用",
    disabled: "已停用",
    configured: "已設定",
    connected: "已連線",
    disconnected: "已斷線",
    running: "執行中",
    stopped: "已停止",
    active: "使用中",
    inactive: "閒置中",
    unknown: "未知",
    none: "無",
    all: "全部",
    search: "搜尋",
    filter: "篩選",
    export: "匯出",
    import: "匯入",
    copy: "複製",
    copied: "已複製！",
    na: "無資料",
    optional: "（選填）",
    required: "必填",
    inherit: "繼承",
    actions: "操作",
  },

  // 應用程式標題與品牌
  app: {
    title: "MOLTBOT",
    subtitle: "閘道器控制台",
    health: "狀態",
    offline: "離線",
    expandSidebar: "展開側邊欄",
    collapseSidebar: "收合側邊欄",
  },

  // 導覽列
  nav: {
    groups: {
      chat: "對話",
      control: "控制",
      agent: "代理",
      settings: "設定",
      resources: "資源",
    },
    tabs: {
      overview: "總覽",
      channels: "頻道",
      instances: "實例",
      sessions: "工作階段",
      cron: "排程任務",
      skills: "技能",
      nodes: "節點",
      chat: "對話",
      config: "組態",
      debug: "除錯",
      logs: "日誌",
    },
    subtitles: {
      overview: "閘道器狀態、進入點與快速健康檢查。",
      channels: "管理頻道與相關設定。",
      instances: "來自已連線用戶端與節點的存在訊號。",
      sessions: "檢視進行中的工作階段並調整個別設定。",
      cron: "排程喚醒與週期性代理執行。",
      skills: "管理技能的啟用狀態與 API 金鑰。",
      nodes: "已配對的裝置、功能與指令權限。",
      chat: "直接與閘道器對話，進行快速操作。",
      config: "安全地編輯 ~/.clawdbot/moltbot.json 設定檔。",
      debug: "閘道器快照、事件記錄與手動 RPC 呼叫。",
      logs: "即時檢視閘道器的檔案日誌。",
    },
    docs: "文件",
    docsTooltip: "文件（在新分頁開啟）",
  },

  // 總覽頁面
  overview: {
    gatewayAccess: "閘道器連線",
    gatewayAccessDesc: "控制台連線位置與認證方式。",
    websocketUrl: "WebSocket 網址",
    gatewayToken: "閘道器 Token",
    password: "密碼（不會儲存）",
    passwordPlaceholder: "系統或共用密碼",
    defaultSessionKey: "預設工作階段金鑰",
    connect: "連線",
    connectNote: "點擊「連線」以套用連線設定。",

    snapshot: "快照",
    snapshotDesc: "最新的閘道器交握資訊。",
    status: "狀態",
    uptime: "運行時間",
    tickInterval: "更新間隔",
    lastChannelsRefresh: "上次頻道更新",

    authRequired: "此閘道器需要認證。請新增 Token 或密碼，然後點擊「連線」。",
    authFailed: "認證失敗。請重新複製包含 Token 的網址：",
    authDocsLink: "文件：控制台認證",
    tokenizedUrlCmd: "moltbot dashboard --no-open",
    generateTokenCmd: "moltbot doctor --generate-gateway-token",
    thenClickConnect: "，或更新 Token，然後點擊「連線」。",

    insecureContext: "此頁面使用 HTTP，瀏覽器會阻擋裝置身分驗證。請使用 HTTPS（Tailscale Serve）或在閘道器主機上開啟",
    insecureContextLocal: "。",
    insecureContextConfig: "如果必須使用 HTTP，請設定",
    insecureContextConfigValue: "gateway.controlUi.allowInsecureAuth: true",
    insecureContextNote: "（僅限 Token 認證）。",
    tailscaleDocsLink: "文件：Tailscale Serve",
    insecureHttpDocsLink: "文件：不安全的 HTTP",

    channelsHint: "使用「頻道」來連結 WhatsApp、Telegram、Discord、Signal 或 iMessage。",

    instancesCard: "實例",
    instancesDesc: "過去 5 分鐘內的存在訊號數量。",
    sessionsCard: "工作階段",
    sessionsDesc: "閘道器追蹤中的近期工作階段金鑰。",
    cronCard: "排程",
    nextWake: "下次喚醒",

    notes: "備註",
    notesDesc: "遠端控制設定的快速提醒。",
    tailscaleServe: "Tailscale serve",
    tailscaleServeDesc: "建議使用 serve 模式，讓閘道器只在本地介面監聽並透過 tailnet 認證。",
    sessionHygiene: "工作階段管理",
    sessionHygieneDesc: "使用 /new 或 sessions.patch 重設上下文。",
    cronReminders: "排程提醒",
    cronRemindersDesc: "週期性執行建議使用獨立的工作階段。",
  },

  // 對話頁面
  chat: {
    message: "訊息",
    messagePlaceholder: "輸入訊息（Enter 送出，Shift+Enter 換行，可貼上圖片）",
    messagePlaceholderWithImages: "新增訊息或貼上更多圖片...",
    connectToChat: "請連線到閘道器以開始對話…",
    send: "送出",
    queue: "排入佇列",
    stop: "停止",
    newSession: "新工作階段",
    loadingChat: "載入對話中…",
    compacting: "壓縮上下文中…",
    compacted: "上下文已壓縮",
    queued: "佇列中",
    removeQueued: "移除佇列中的訊息",
    exitFocusMode: "離開專注模式",
    removeAttachment: "移除附件",
    attachmentPreview: "附件預覽",
    showingLast: "顯示最後 {{count}} 則訊息（已隱藏 {{hidden}} 則）。",
    image: "圖片",
  },

  // 頻道頁面
  channels: {
    title: "頻道",
    health: "頻道健康狀態",
    healthDesc: "來自閘道器的頻道狀態快照。",
    noSnapshot: "尚無快照資料。",
    statusAndConfig: "頻道狀態與設定。",
    lastInbound: "上次收到訊息",

    // 狀態標籤
    labels: {
      configured: "已設定",
      running: "執行中",
      connected: "已連線",
    },

    // WhatsApp
    whatsapp: {
      title: "WhatsApp",
      desc: "透過 Baileys 連接 WhatsApp（多裝置）。",
      start: "開始",
      relink: "重新連結",
      logout: "登出",
      scanQr: "請用手機上的 WhatsApp 掃描 QR Code。",
      linking: "連結中…",
      waitingForQr: "等待 QR Code…",
      notConfigured: "尚未設定。",
    },

    // Telegram
    telegram: {
      title: "Telegram",
      desc: "透過 Grammy 連接 Telegram 機器人。",
    },

    // Discord
    discord: {
      title: "Discord",
      desc: "透過 discord.js 連接 Discord 機器人。",
    },

    // Slack
    slack: {
      title: "Slack",
      desc: "透過 Bolt 框架連接 Slack 應用程式。",
    },

    // Signal
    signal: {
      title: "Signal",
      desc: "透過 signal-cli 或已連結裝置連接 Signal。",
    },

    // iMessage
    imessage: {
      title: "iMessage",
      desc: "透過 BlueBubbles 伺服器連接 iMessage。",
    },

    // Google Chat
    googlechat: {
      title: "Google Chat",
      desc: "透過服務帳戶連接 Google Chat。",
    },

    // Nostr
    nostr: {
      title: "Nostr",
      desc: "透過 NIP-04 私訊連接 Nostr 協定。",
      editProfile: "編輯個人檔案",
      profileForm: {
        title: "編輯 Nostr 個人檔案",
        name: "顯示名稱",
        about: "關於",
        picture: "頭像網址",
        nip05: "NIP-05 識別碼",
        lud16: "閃電網路地址",
        banner: "橫幅圖片網址",
        website: "網站",
        showAdvanced: "顯示進階欄位",
        hideAdvanced: "隱藏進階欄位",
        importFromRelays: "從中繼站匯入",
        importing: "匯入中…",
      },
    },

    // 設定區塊
    config: {
      title: "頻道組態",
      saveChanges: "儲存變更",
      reloadConfig: "重新載入組態",
      unsavedChanges: "有未儲存的變更",
    },
  },

  // 工作階段頁面
  sessions: {
    title: "工作階段",
    desc: "進行中的工作階段金鑰與個別覆寫設定。",
    activeWithin: "活動時間（分鐘）",
    limit: "數量限制",
    includeGlobal: "包含全域",
    includeUnknown: "包含未知",
    store: "儲存位置",
    noSessions: "找不到工作階段。",

    columns: {
      key: "金鑰",
      label: "標籤",
      kind: "類型",
      updated: "更新時間",
      tokens: "Token 數",
      thinking: "思考模式",
      verbose: "詳細模式",
      reasoning: "推理模式",
      actions: "操作",
    },

    levels: {
      off: "關閉",
      minimal: "最小",
      low: "低",
      medium: "中",
      high: "高",
      on: "開啟",
      stream: "串流",
      offExplicit: "關閉（明確）",
    },
  },

  // 排程任務頁面
  cron: {
    title: "排程任務",
    desc: "排程代理喚醒與週期性任務。",
    noJobs: "尚無任務。",
    addJob: "新增任務",
    runNow: "立即執行",
    remove: "移除",
    enable: "啟用",
    disable: "停用",
    runs: "執行記錄",
    lastRun: "上次執行",
    nextRun: "下次執行",

    // 排程器卡片
    scheduler: "排程器",
    schedulerDesc: "閘道器所管理的排程器狀態。",
    jobs: "任務數",

    // 新任務表單
    newJob: "新增任務",
    newJobDesc: "建立排程喚醒或代理執行。",
    name: "名稱",
    description: "描述",
    agentId: "代理 ID",
    agentIdPlaceholder: "default",
    scheduleKind: "排程類型",
    everyLabel: "間隔",
    atLabel: "指定時間",
    cronLabel: "Cron",
    runAt: "執行時間",
    every: "每隔",
    unit: "單位",
    minutes: "分鐘",
    hours: "小時",
    days: "天",
    expression: "運算式",
    timezone: "時區（選填）",
    session: "工作階段",
    main: "主要",
    isolated: "獨立",
    wakeMode: "喚醒模式",
    nextHeartbeat: "下次心跳",
    now: "立即",
    payload: "內容類型",
    systemEvent: "系統事件",
    agentTurn: "代理回合",
    systemText: "系統文字",
    agentMessage: "代理訊息",
    deliver: "傳送",
    to: "收件者",
    toPlaceholder: "+1555… 或聊天 ID",
    timeoutSeconds: "逾時（秒）",
    postToMainPrefix: "發送至主工作階段前綴",

    // 任務列表
    jobsList: "任務",
    jobsListDesc: "所有儲存在閘道器的排程任務。",

    // 執行歷史
    runHistory: "執行歷史",
    runHistoryDesc: "最近的執行記錄：",
    selectJob: "選擇任務以檢視執行歷史。",
    noRuns: "尚無執行記錄。",

    form: {
      schedule: "排程（cron 格式）",
      message: "訊息",
      sessionKey: "工作階段金鑰",
      channel: "頻道",
      channelPlaceholder: "選擇頻道",
      enabled: "啟用",
    },

    status: {
      enabled: "排程已啟用",
      disabled: "排程已停用",
      nextWake: "下次喚醒",
    },
  },

  // 技能頁面
  skills: {
    title: "技能",
    desc: "管理內建與已安裝的技能。",
    noSkills: "找不到技能。",
    filter: "篩選技能",
    shown: "個顯示中",
    apiKey: "API 金鑰",
    saveKey: "儲存金鑰",
    install: "安裝",
    installing: "安裝中…",
    enabled: "已啟用",
    disabled: "已停用",
    toggle: "切換",
    keySaved: "API 金鑰已儲存",
    keyError: "儲存 API 金鑰失敗",
    eligible: "可用",
    blocked: "已封鎖",
    missing: "缺少",
    reason: "原因",
    blockedByAllowlist: "被許可清單封鎖",
  },

  // 節點頁面
  nodes: {
    title: "節點",
    desc: "已配對的裝置與即時連結。",
    noNodes: "找不到節點。",
    devices: "裝置",
    devicesDesc: "配對請求與角色權杖。",
    noDevices: "沒有已配對的裝置。",
    approve: "核准",
    reject: "拒絕",
    revoke: "撤銷",
    rotate: "輪換",
    pending: "待處理",
    paired: "已配對",
    approved: "已核准",
    offline: "離線",
    tokens: "權杖",
    tokensNone: "權杖：無",
    role: "角色",
    requested: "請求於",
    repair: "修復",
    active: "使用中",
    revoked: "已撤銷",
    scopes: "範圍",
    roles: "角色",

    bindings: {
      title: "執行節點綁定",
      desc: "使用時將代理固定到特定節點",
      default: "預設綁定",
      defaultDesc: "當代理未覆寫節點綁定時使用。",
      agent: "代理",
      node: "節點",
      anyNode: "任意節點",
      useDefault: "使用預設",
      save: "儲存",
      loadConfig: "載入組態",
      loadConfigNote: "載入組態以編輯綁定。",
      noNodesAvailable: "沒有支援 system.run 的節點。",
      defaultAgent: "預設代理",
      usesDefault: "使用預設",
      override: "覆寫",
      switchToForm: "請將「組態」分頁切換為「表單」模式以在此編輯綁定。",
    },

    approvals: {
      title: "執行核准",
      desc: "許可清單與核准政策，適用於",
      target: "目標",
      targetDesc: "閘道器編輯本地核准；節點編輯選定的節點。",
      host: "主機",
      gateway: "閘道器",
      selectNode: "選擇節點",
      noNodesYet: "尚無節點公告執行核准。",
      scope: "範圍",
      defaults: "預設值",
      security: "安全性",
      securityDesc: "預設安全模式。",
      mode: "模式",
      deny: "拒絕",
      allowlist: "許可清單",
      full: "完整",
      ask: "詢問",
      askDesc: "預設提示政策。",
      off: "關閉",
      onMiss: "未命中時",
      always: "總是",
      askFallback: "詢問備援",
      askFallbackDesc: "當 UI 提示不可用時套用。",
      fallback: "備援",
      autoAllowSkills: "自動允許技能 CLI",
      autoAllowSkillsDesc: "允許閘道器列出的技能可執行檔。",
      usingDefault: "使用預設",
      addPattern: "新增模式",
      allowlistTitle: "許可清單",
      allowlistDesc: "不區分大小寫的 glob 模式。",
      noAllowlist: "尚無許可清單項目。",
      pattern: "模式",
      newPattern: "新模式",
      lastUsed: "上次使用",
      never: "從未",
      remove: "移除",
      loadApprovals: "載入核准",
      loadApprovalsNote: "載入執行核准以編輯許可清單。",
    },
  },

  // 組態頁面
  config: {
    title: "設定",
    desc: "具有結構驗證的組態編輯器。",
    valid: "有效",
    invalid: "無效",
    searchSettings: "搜尋設定...",
    allSettings: "所有設定",
    form: "表單",
    raw: "原始",
    rawJson5: "原始 JSON5",
    reload: "重新載入",
    update: "更新",
    updating: "更新中…",
    noChanges: "沒有變更",
    unsavedChanges: "有未儲存的變更",
    unsavedCount: "{{count}} 個未儲存的變更",
    unsavedCountPlural: "{{count}} 個未儲存的變更",
    viewPending: "檢視 {{count}} 個待處理變更",
    viewPendingPlural: "檢視 {{count}} 個待處理變更",
    loadingSchema: "載入結構定義中…",
    formUnsafe: "表單模式無法安全編輯某些欄位。請使用原始模式以避免遺失設定。",

    sections: {
      env: "環境",
      update: "更新",
      agents: "代理",
      auth: "認證",
      channels: "頻道",
      messages: "訊息",
      commands: "指令",
      hooks: "鉤子",
      skills: "技能",
      tools: "工具",
      gateway: "閘道器",
      wizard: "設定精靈",
    },
  },

  // 除錯頁面
  debug: {
    title: "除錯",
    desc: "閘道器內部狀態與手動 RPC 測試。",
    status: "狀態",
    health: "健康狀態",
    models: "模型",
    modelsDesc: "來自 models.list 的目錄。",
    heartbeat: "心跳",
    lastHeartbeat: "上次心跳",
    events: "事件",
    eventLog: "事件日誌",
    eventLogDesc: "最新的閘道器事件。",
    noEvents: "尚無事件。",
    rpcCall: "RPC 呼叫",
    manualRpc: "手動 RPC",
    manualRpcDesc: "使用 JSON 參數發送原始閘道器方法。",
    method: "方法",
    params: "參數",
    paramsJson: "參數（JSON）",
    call: "呼叫",
    result: "結果",
    noResult: "尚無結果。",
    snapshots: "快照",
    snapshotsDesc: "狀態、健康狀態與心跳資料。",
    securityAudit: "安全稽核",
    critical: "嚴重",
    warnings: "警告",
    noCritical: "無嚴重問題",
    runAuditCmd: "執行以檢視詳情。",
  },

  // 日誌頁面
  logs: {
    title: "日誌",
    desc: "閘道器檔案日誌（JSONL 格式）。",
    filter: "篩選",
    searchLogs: "搜尋日誌",
    autoFollow: "自動捲動",
    file: "檔案",
    truncated: "日誌輸出已截斷；顯示最新的部分。",
    noEntries: "沒有日誌記錄。",
    exportFiltered: "匯出篩選結果",
    exportVisible: "匯出可見內容",

    levels: {
      trace: "追蹤",
      debug: "除錯",
      info: "資訊",
      warn: "警告",
      error: "錯誤",
      fatal: "嚴重",
    },
  },

  // 實例頁面
  instances: {
    title: "實例",
    desc: "來自已連線閘道器與節點的存在訊號。",
    noInstances: "找不到存在訊號。",
    id: "識別碼",
    type: "類型",
    version: "版本",
    lastSeen: "上次出現",
  },

  // 執行核准提示
  execApproval: {
    title: "需要執行核准",
    command: "指令",
    agent: "代理",
    allowOnce: "允許一次",
    allowAlways: "永久允許",
    deny: "拒絕",
  },

  // 主題
  theme: {
    toggle: "切換主題",
    light: "淺色",
    dark: "深色",
    system: "跟隨系統",
  },

  // 時間/日期格式
  time: {
    justNow: "剛剛",
    minutesAgo: "{{count}} 分鐘前",
    hoursAgo: "{{count}} 小時前",
    daysAgo: "{{count}} 天前",
    never: "從未",
  },

  // Markdown 側邊欄
  sidebar: {
    close: "關閉",
    viewRaw: "檢視原始內容",
    error: "載入內容時發生錯誤",
  },

  // 錯誤訊息
  errors: {
    connectionFailed: "連線失敗",
    loadFailed: "載入失敗",
    saveFailed: "儲存失敗",
    unknownError: "發生未知錯誤",
    networkError: "網路錯誤",
    timeout: "請求逾時",
    unauthorized: "未授權",
    forbidden: "禁止存取",
    notFound: "找不到資源",
  },
};
