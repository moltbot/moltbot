import type { MoltbotApp } from "../app";
import { DEFAULT_TASK_BOARD, type TaskBoard } from "../types/task-board";

export async function loadTaskBoard(host: MoltbotApp) {
  if (!host.client || !host.connected) return;
  host.taskBoardLoading = true;
  host.taskBoardError = null;
  try {
    const res = (await host.client.request("tasks.get")) as {
      board?: unknown;
      path?: unknown;
    };
    const board = isTaskBoard(res.board) ? res.board : DEFAULT_TASK_BOARD;
    host.taskBoard = board;
    host.taskBoardPath = typeof res.path === "string" ? res.path : null;
  } catch (err: any) {
    host.taskBoardError = String(err?.message ?? err);
  } finally {
    host.taskBoardLoading = false;
  }
}

export async function saveTaskBoard(host: MoltbotApp, board: TaskBoard) {
  if (!host.client || !host.connected) return;
  host.taskBoardSaving = true;
  host.taskBoardError = null;
  try {
    const res = (await host.client.request("tasks.save", { board })) as {
      board?: unknown;
      path?: unknown;
    };
    const next = isTaskBoard(res.board) ? res.board : board;
    host.taskBoard = next;
    host.taskBoardPath = typeof res.path === "string" ? res.path : host.taskBoardPath;
  } catch (err: any) {
    host.taskBoardError = String(err?.message ?? err);
  } finally {
    host.taskBoardSaving = false;
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function isTaskBoard(v: unknown): v is TaskBoard {
  if (!isPlainObject(v)) return false;
  if (v.version !== 3) return false;
  if (!isPlainObject(v.columns)) return false;
  if (!isPlainObject(v.tasksById)) return false;
  return true;
}
