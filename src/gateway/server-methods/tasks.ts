import fs from "node:fs/promises";
import path from "node:path";

import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";
import { loadConfig } from "../../config/io.js";

type TaskColumnId = "todo" | "doing" | "done" | "blocked";

type TaskChecklistItem = {
  id: string;
  text: string;
  done: boolean;
};

type TaskEntity = {
  id: string;
  name: string;
  description: string;
  createdAtMs: number;
  updatedAtMs: number;

  priority?: number;
  dueAtMs?: number | null;
  tags?: string[];
  links?: string[];
  checklist?: TaskChecklistItem[];
  blockReason?: string;

  extras?: Record<string, unknown>;
};

export type TaskBoardV3 = {
  version: 3;
  updatedAtMs: number;
  tasksById: Record<string, TaskEntity>;
  columns: Record<TaskColumnId, string[]>;
};

type TaskBoardV2 = {
  version: 2;
  updatedAtMs: number;
  tasksById: Record<string, TaskEntity>;
  columns: Record<"todo" | "doing" | "done" | "later", string[]>;
};

type TaskBoardV1 = {
  version: 1;
  updatedAtMs: number;
  columns: Record<
    "todo" | "doing" | "done" | "later",
    Array<{ id: string; title: string; createdAtMs: number; updatedAtMs: number }>
  >;
};

const DEFAULT_BOARD: TaskBoardV3 = {
  version: 3,
  updatedAtMs: 0,
  tasksById: {},
  columns: { todo: [], doing: [], done: [], blocked: [] },
};

function resolveBoardPath(): string {
  const cfg = loadConfig();
  const workspace = cfg.agents?.defaults?.workspace;
  const base = typeof workspace === "string" && workspace.trim() ? workspace.trim() : process.cwd();
  return path.join(base, "tasks", "board.json");
}

async function readBoardFile(filePath: string): Promise<TaskBoardV3> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;

    const v3 = coerceBoardV3(parsed);
    if (v3) return v3;

    const migrated = migrateToV3(parsed);
    if (migrated) {
      await writeBoardFile(filePath, migrated);
      return migrated;
    }

    return { ...DEFAULT_BOARD };
  } catch (err: any) {
    if (err?.code === "ENOENT") return { ...DEFAULT_BOARD };
    // If corrupted, return default rather than failing the UI.
    return { ...DEFAULT_BOARD };
  }
}

async function writeBoardFile(filePath: string, board: TaskBoardV3): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(board, null, 2) + "\n", "utf-8");
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function coerceStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x) => typeof x === "string")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 2000);
}

function coerceTaskEntity(idHint: string, v: unknown): TaskEntity | null {
  if (!isPlainObject(v)) return null;

  const id = (typeof v.id === "string" ? v.id : idHint).trim();
  const name = typeof v.name === "string" ? v.name.trim() : "";
  const description = typeof v.description === "string" ? v.description : "";
  const createdAtMs = typeof v.createdAtMs === "number" ? v.createdAtMs : Date.now();
  const updatedAtMs = typeof v.updatedAtMs === "number" ? v.updatedAtMs : createdAtMs;
  if (!id || !name) return null;

  const priority = typeof v.priority === "number" ? v.priority : undefined;
  const dueAtMs = typeof v.dueAtMs === "number" ? v.dueAtMs : v.dueAtMs === null ? null : undefined;
  const tags = Array.isArray(v.tags)
    ? v.tags
        .filter((x) => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 50)
    : undefined;
  const links = Array.isArray(v.links)
    ? v.links
        .filter((x) => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 200)
    : undefined;

  const checklist = Array.isArray(v.checklist)
    ? v.checklist
        .map((x) => {
          if (!isPlainObject(x)) return null;
          const cid = typeof x.id === "string" ? x.id.trim() : "";
          const text = typeof x.text === "string" ? x.text : "";
          const done = Boolean(x.done);
          if (!cid) return null;
          return { id: cid, text, done } satisfies TaskChecklistItem;
        })
        .filter((x): x is TaskChecklistItem => Boolean(x))
        .slice(0, 500)
    : undefined;

  const blockReason = typeof v.blockReason === "string" ? v.blockReason : undefined;
  const extras = isPlainObject(v.extras) ? (v.extras as Record<string, unknown>) : undefined;

  return {
    id: id.slice(0, 128),
    name: name.slice(0, 300),
    description: description.slice(0, 20_000),
    createdAtMs,
    updatedAtMs,
    priority,
    dueAtMs,
    tags,
    links,
    checklist,
    blockReason: typeof blockReason === "string" ? blockReason.slice(0, 20_000) : undefined,
    extras,
  };
}

function coerceBoardV3(v: unknown): TaskBoardV3 | null {
  if (!isPlainObject(v)) return null;
  if (v.version !== 3) return null;
  if (!isPlainObject(v.columns) || !isPlainObject(v.tasksById)) return null;

  const columnsRaw = v.columns as Record<string, unknown>;
  const tasksByIdRaw = v.tasksById as Record<string, unknown>;

  const tasksById: Record<string, TaskEntity> = {};
  for (const [id, raw] of Object.entries(tasksByIdRaw)) {
    const coerced = coerceTaskEntity(id, raw);
    if (coerced) tasksById[coerced.id] = coerced;
  }

  const columns: Record<TaskColumnId, string[]> = {
    todo: coerceStringArray(columnsRaw.todo),
    doing: coerceStringArray(columnsRaw.doing),
    done: coerceStringArray(columnsRaw.done),
    blocked: coerceStringArray(columnsRaw.blocked),
  };

  // Drop ids that don't exist.
  for (const key of Object.keys(columns) as TaskColumnId[]) {
    columns[key] = columns[key].filter((id) => Boolean(tasksById[id]));
  }

  const updatedAtMs = typeof v.updatedAtMs === "number" ? v.updatedAtMs : 0;
  return { version: 3, updatedAtMs, tasksById, columns };
}

function migrateV1ToV3(v: unknown): TaskBoardV3 | null {
  if (!isPlainObject(v)) return null;
  if (v.version !== 1) return null;
  if (!isPlainObject(v.columns)) return null;

  const cols = v.columns as Record<string, unknown>;
  const updatedAtMs = typeof v.updatedAtMs === "number" ? v.updatedAtMs : 0;

  const tasksById: Record<string, TaskEntity> = {};
  const columns: Record<TaskColumnId, string[]> = {
    todo: [],
    doing: [],
    done: [],
    blocked: [],
  };

  for (const key of ["todo", "doing", "done", "later"] as const) {
    const items = Array.isArray(cols[key]) ? cols[key] : [];
    for (const item of items) {
      if (!isPlainObject(item)) continue;
      const id = typeof item.id === "string" ? item.id.trim() : "";
      const title = typeof item.title === "string" ? item.title.trim() : "";
      if (!id || !title) continue;
      const createdAtMs = typeof item.createdAtMs === "number" ? item.createdAtMs : Date.now();
      const updatedAt = typeof item.updatedAtMs === "number" ? item.updatedAtMs : createdAtMs;
      tasksById[id] = {
        id,
        name: title,
        description: "",
        createdAtMs,
        updatedAtMs: updatedAt,
        priority: 3,
        dueAtMs: null,
        tags: [],
        links: [],
        checklist: [],
        blockReason: "",
        extras: {},
      };
      const targetColumn: TaskColumnId = key === "later" ? "blocked" : (key satisfies any);
      columns[targetColumn].push(id);
    }
  }

  return { version: 3, updatedAtMs, tasksById, columns };
}

function migrateV2ToV3(v: unknown): TaskBoardV3 | null {
  if (!isPlainObject(v)) return null;
  if (v.version !== 2) return null;
  if (!isPlainObject(v.columns) || !isPlainObject(v.tasksById)) return null;

  const updatedAtMs = typeof v.updatedAtMs === "number" ? v.updatedAtMs : 0;

  // Reuse entity coercion and just map columns.
  const tasksByIdRaw = v.tasksById as Record<string, unknown>;
  const tasksById: Record<string, TaskEntity> = {};
  for (const [id, raw] of Object.entries(tasksByIdRaw)) {
    const coerced = coerceTaskEntity(id, raw);
    if (coerced) {
      tasksById[coerced.id] = {
        ...coerced,
        blockReason: typeof coerced.blockReason === "string" ? coerced.blockReason : "",
      };
    }
  }

  const cols = v.columns as Record<string, unknown>;
  const todo = coerceStringArray(cols.todo);
  const doing = coerceStringArray(cols.doing);
  const done = coerceStringArray(cols.done);
  const blocked = coerceStringArray(cols.later);

  const columns: Record<TaskColumnId, string[]> = {
    todo: todo.filter((id) => Boolean(tasksById[id])),
    doing: doing.filter((id) => Boolean(tasksById[id])),
    done: done.filter((id) => Boolean(tasksById[id])),
    blocked: blocked.filter((id) => Boolean(tasksById[id])),
  };

  return { version: 3, updatedAtMs, tasksById, columns };
}

function migrateToV3(v: unknown): TaskBoardV3 | null {
  return migrateV2ToV3(v) ?? migrateV1ToV3(v);
}

function validateIncomingBoard(
  v: unknown,
): { ok: true; board: TaskBoardV3 } | { ok: false; message: string } {
  const coerced = coerceBoardV3(v);
  if (!coerced) return { ok: false, message: "board must be a v3 task board" };
  const ids = Object.keys(coerced.tasksById);
  if (ids.length > 5000) return { ok: false, message: "too many tasks" };
  return { ok: true, board: coerced };
}

export const tasksHandlers: GatewayRequestHandlers = {
  "tasks.get": async ({ respond }) => {
    const filePath = resolveBoardPath();
    const board = await readBoardFile(filePath);
    respond(true, { board, path: filePath });
  },

  "tasks.save": async ({ params, respond }) => {
    const incoming = (params as Record<string, unknown>).board;
    const validated = validateIncomingBoard(incoming);
    if (!validated.ok) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, validated.message));
      return;
    }
    const filePath = resolveBoardPath();
    const now = Date.now();
    const next: TaskBoardV3 = {
      ...validated.board,
      updatedAtMs: now,
    };
    await writeBoardFile(filePath, next);
    respond(true, { ok: true, board: next, path: filePath });
  },
};
