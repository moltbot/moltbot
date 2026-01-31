import { loadModelCatalog } from "../../agents/model-catalog.js";
import {
  buildAllowedModelSet,
  buildModelAliasIndex,
  normalizeProviderId,
  resolveConfiguredModelRef,
  resolveModelRefFromString,
} from "../../agents/model-selection.js";
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "../../agents/defaults.js";
import type { OpenClawConfig } from "../../config/config.js";
import type { ReplyPayload } from "../types.js";
import type { CommandHandler } from "./commands-types.js";

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 100;

const TELEGRAM_MENU_COLS = 3;
const TELEGRAM_MENU_ROWS = 3;
// Max 9 buttons per screen (3x3). Reserve the last row for navigation.
const TELEGRAM_MENU_ITEMS_PER_PAGE = (TELEGRAM_MENU_ROWS - 1) * TELEGRAM_MENU_COLS; // 6

type TelegramButtons = Array<Array<{ text: string; callback_data: string }>>;

type MenuItem = { text: string; callback_data: string };

function truncateButtonText(text: string, max = 36): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

function chunkIntoRows(items: MenuItem[], cols: number): MenuItem[][] {
  const rows: MenuItem[][] = [];
  for (let i = 0; i < items.length; i += cols) {
    rows.push(items.slice(i, i + cols));
  }
  return rows;
}

function buildPagedMenuButtons(params: {
  items: MenuItem[];
  page: number;
  pageCount: number;
  prevCallback: string;
  nextCallback: string;
  middle: MenuItem;
}): TelegramButtons {
  const safePage = Math.max(1, Math.min(params.page, params.pageCount || 1));
  const startIndex = (safePage - 1) * TELEGRAM_MENU_ITEMS_PER_PAGE;
  const pageItems = params.items.slice(startIndex, startIndex + TELEGRAM_MENU_ITEMS_PER_PAGE);

  const rows = chunkIntoRows(pageItems, TELEGRAM_MENU_COLS).slice(0, TELEGRAM_MENU_ROWS - 1);

  // Navigation row always present (3 buttons).
  rows.push([
    { text: "Prev", callback_data: params.prevCallback },
    params.middle,
    { text: "Next", callback_data: params.nextCallback },
  ]);

  // Normalize text (no emojis, keep short)
  return rows.map((row) =>
    row.map((btn) => ({
      text: truncateButtonText(btn.text),
      callback_data: btn.callback_data,
    })),
  );
}

function formatProviderLine(params: { provider: string; count: number }): string {
  return `- ${params.provider} (${params.count})`;
}

function parseModelsArgs(raw: string): {
  provider?: string;
  page: number;
  pageSize: number;
  all: boolean;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { page: 1, pageSize: PAGE_SIZE_DEFAULT, all: false };
  }

  const tokens = trimmed.split(/\s+/g).filter(Boolean);

  const first = tokens[0]?.trim();
  const firstLower = first?.toLowerCase();
  const firstIsProvider =
    Boolean(first) &&
    !/^[0-9]+$/.test(firstLower ?? "") &&
    !(firstLower ?? "").startsWith("page=") &&
    firstLower !== "all" &&
    firstLower !== "--all";

  const provider = firstIsProvider ? normalizeProviderId(first!) : undefined;
  const parseTokens = firstIsProvider ? tokens.slice(1) : tokens;

  let page = 1;
  let all = false;
  for (const token of parseTokens) {
    const lower = token.toLowerCase();
    if (lower === "all" || lower === "--all") {
      all = true;
      continue;
    }
    if (lower.startsWith("page=")) {
      const value = Number.parseInt(lower.slice("page=".length), 10);
      if (Number.isFinite(value) && value > 0) {
        page = value;
      }
      continue;
    }
    if (/^[0-9]+$/.test(lower)) {
      const value = Number.parseInt(lower, 10);
      if (Number.isFinite(value) && value > 0) {
        page = value;
      }
    }
  }

  let pageSize = PAGE_SIZE_DEFAULT;
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (lower.startsWith("limit=") || lower.startsWith("size=")) {
      const rawValue = lower.slice(lower.indexOf("=") + 1);
      const value = Number.parseInt(rawValue, 10);
      if (Number.isFinite(value) && value > 0) {
        pageSize = Math.min(PAGE_SIZE_MAX, value);
      }
    }
  }

  return {
    provider,
    page,
    pageSize,
    all,
  };
}

export async function resolveModelsCommandReply(params: {
  cfg: OpenClawConfig;
  commandBodyNormalized: string;
  channel?: string;
}): Promise<ReplyPayload | null> {
  const body = params.commandBodyNormalized.trim();
  if (!body.startsWith("/models")) {
    return null;
  }

  const argText = body.replace(/^\/models\b/i, "").trim();
  const { provider, page, pageSize: parsedPageSize, all } = parseModelsArgs(argText);
  const isTelegram = params.channel?.toLowerCase() === "telegram";
  // When rendering a Telegram inline menu for models, force the page size to match the 3x3 UI.
  const pageSize = isTelegram && !all && provider ? TELEGRAM_MENU_ITEMS_PER_PAGE : parsedPageSize;

  const resolvedDefault = resolveConfiguredModelRef({
    cfg: params.cfg,
    defaultProvider: DEFAULT_PROVIDER,
    defaultModel: DEFAULT_MODEL,
  });

  const catalog = await loadModelCatalog({ config: params.cfg });
  const allowed = buildAllowedModelSet({
    cfg: params.cfg,
    catalog,
    defaultProvider: resolvedDefault.provider,
    defaultModel: resolvedDefault.model,
  });

  const aliasIndex = buildModelAliasIndex({
    cfg: params.cfg,
    defaultProvider: resolvedDefault.provider,
  });

  const byProvider = new Map<string, Set<string>>();
  const add = (p: string, m: string) => {
    const key = normalizeProviderId(p);
    const set = byProvider.get(key) ?? new Set<string>();
    set.add(m);
    byProvider.set(key, set);
  };

  const addRawModelRef = (raw?: string) => {
    const trimmed = raw?.trim();
    if (!trimmed) {
      return;
    }
    const resolved = resolveModelRefFromString({
      raw: trimmed,
      defaultProvider: resolvedDefault.provider,
      aliasIndex,
    });
    if (!resolved) {
      return;
    }
    add(resolved.ref.provider, resolved.ref.model);
  };

  const addModelConfigEntries = () => {
    const modelConfig = params.cfg.agents?.defaults?.model;
    if (typeof modelConfig === "string") {
      addRawModelRef(modelConfig);
    } else if (modelConfig && typeof modelConfig === "object") {
      addRawModelRef(modelConfig.primary);
      for (const fallback of modelConfig.fallbacks ?? []) {
        addRawModelRef(fallback);
      }
    }

    const imageConfig = params.cfg.agents?.defaults?.imageModel;
    if (typeof imageConfig === "string") {
      addRawModelRef(imageConfig);
    } else if (imageConfig && typeof imageConfig === "object") {
      addRawModelRef(imageConfig.primary);
      for (const fallback of imageConfig.fallbacks ?? []) {
        addRawModelRef(fallback);
      }
    }
  };

  for (const entry of allowed.allowedCatalog) {
    add(entry.provider, entry.id);
  }

  // Include config-only allowlist keys that aren't in the curated catalog.
  for (const raw of Object.keys(params.cfg.agents?.defaults?.models ?? {})) {
    addRawModelRef(raw);
  }

  // Ensure configured defaults/fallbacks/image models show up even when the
  // curated catalog doesn't know about them (custom providers, dev builds, etc.).
  add(resolvedDefault.provider, resolvedDefault.model);
  addModelConfigEntries();

  const providers = [...byProvider.keys()].toSorted();

  if (!provider) {
    const lines: string[] = [
      "Providers:",
      ...providers.map((p) =>
        formatProviderLine({ provider: p, count: byProvider.get(p)?.size ?? 0 }),
      ),
      "",
      "Use: /models <provider>",
      "Switch: /model <provider/model>",
    ];

    const payload: ReplyPayload = { text: lines.join("\n") };

    if (isTelegram && providers.length > 0) {
      const providerItems: MenuItem[] = providers.map((p) => ({
        text: `${p} (${byProvider.get(p)?.size ?? 0})`,
        callback_data: `/models ${p}`,
      }));
      const pageCount = Math.max(1, Math.ceil(providerItems.length / TELEGRAM_MENU_ITEMS_PER_PAGE));
      const safePage = Math.max(1, Math.min(page, pageCount));
      const prevPage = safePage > 1 ? safePage - 1 : safePage;
      const nextPage = safePage < pageCount ? safePage + 1 : safePage;

      const buttons = buildPagedMenuButtons({
        items: providerItems,
        page: safePage,
        pageCount,
        prevCallback: `/models ${prevPage}`,
        nextCallback: `/models ${nextPage}`,
        middle: { text: "Status", callback_data: "/model status" },
      });

      payload.channelData = {
        ...(payload.channelData ?? {}),
        telegram: {
          buttons,
        },
      };
    }

    return payload;
  }

  if (!byProvider.has(provider)) {
    const lines: string[] = [
      `Unknown provider: ${provider}`,
      "",
      "Available providers:",
      ...providers.map((p) => `- ${p}`),
      "",
      "Use: /models <provider>",
    ];

    const payload: ReplyPayload = { text: lines.join("\n") };
    if (isTelegram && providers.length > 0) {
      const providerItems: MenuItem[] = providers.map((p) => ({
        text: `${p} (${byProvider.get(p)?.size ?? 0})`,
        callback_data: `/models ${p}`,
      }));
      const pageCount = Math.max(1, Math.ceil(providerItems.length / TELEGRAM_MENU_ITEMS_PER_PAGE));
      const safePage = 1;
      const prevPage = safePage;
      const nextPage = safePage < pageCount ? safePage + 1 : safePage;
      const buttons = buildPagedMenuButtons({
        items: providerItems,
        page: safePage,
        pageCount,
        prevCallback: `/models ${prevPage}`,
        nextCallback: `/models ${nextPage}`,
        middle: { text: "Status", callback_data: "/model status" },
      });
      payload.channelData = {
        ...(payload.channelData ?? {}),
        telegram: { buttons },
      };
    }

    return payload;
  }

  const models = [...(byProvider.get(provider) ?? new Set<string>())].toSorted();
  const total = models.length;

  if (total === 0) {
    const lines: string[] = [
      `Models (${provider}) — none`,
      "",
      "Browse: /models",
      "Switch: /model <provider/model>",
    ];
    return { text: lines.join("\n") };
  }

  const effectivePageSize = all ? total : pageSize;
  const pageCount = effectivePageSize > 0 ? Math.ceil(total / effectivePageSize) : 1;
  const safePage = all ? 1 : Math.max(1, Math.min(page, pageCount));

  if (!all && page !== safePage) {
    const lines: string[] = [
      `Page out of range: ${page} (valid: 1-${pageCount})`,
      "",
      `Try: /models ${provider} ${safePage}`,
      `All: /models ${provider} all`,
    ];
    return { text: lines.join("\n") };
  }

  const startIndex = (safePage - 1) * effectivePageSize;
  const endIndexExclusive = Math.min(total, startIndex + effectivePageSize);
  const pageModels = models.slice(startIndex, endIndexExclusive);

  const header = `Models (${provider}) — showing ${startIndex + 1}-${endIndexExclusive} of ${total} (page ${safePage}/${pageCount})`;

  const lines: string[] = [header];
  for (const id of pageModels) {
    lines.push(`- ${provider}/${id}`);
  }

  lines.push("", "Switch: /model <provider/model>");
  if (!all && safePage < pageCount) {
    lines.push(`More: /models ${provider} ${safePage + 1}`);
  }
  if (!all) {
    lines.push(`All: /models ${provider} all`);
  }

  const payload: ReplyPayload = { text: lines.join("\n") };

  if (isTelegram && !all) {
    const allModelItems: MenuItem[] = models.map((id) => {
      const fullRef = `${provider}/${id}`;
      const aliases = aliasIndex.byKey.get(fullRef);
      const alias = aliases?.[0];
      const callback = alias ? `/model ${alias}` : `/model ${fullRef}`;
      const label = alias ? alias : id;
      return { text: label, callback_data: callback };
    });

    const safeMenuPage = Math.max(1, Math.min(safePage, pageCount));
    const prevPage = safeMenuPage > 1 ? safeMenuPage - 1 : safeMenuPage;
    const nextPage = safeMenuPage < pageCount ? safeMenuPage + 1 : safeMenuPage;

    const buttons = buildPagedMenuButtons({
      items: allModelItems,
      page: safeMenuPage,
      pageCount,
      prevCallback: `/models ${provider} ${prevPage}`,
      nextCallback: `/models ${provider} ${nextPage}`,
      middle: { text: "Providers", callback_data: "/models" },
    });

    payload.channelData = {
      ...(payload.channelData ?? {}),
      telegram: {
        buttons,
      },
    };
  }

  return payload;
}

export const handleModelsCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) {
    return null;
  }

  const reply = await resolveModelsCommandReply({
    cfg: params.cfg,
    commandBodyNormalized: params.command.commandBodyNormalized,
    channel: params.command.channel,
  });
  if (!reply) {
    return null;
  }
  return { reply, shouldContinue: false };
};
