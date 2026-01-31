/**
 * Tests for task store.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getTaskStore,
  getTask,
  setTask,
  updateTask,
  deleteTask,
  getTasksForSession,
  getPendingTasks,
  clearTasks,
  stopCleanup,
} from "./task-store.js";
import type { CursorAgentTask } from "./types.js";

describe("task-store", () => {
  beforeEach(() => {
    clearTasks();
  });

  afterEach(() => {
    stopCleanup();
    clearTasks();
  });

  const createTask = (overrides: Partial<CursorAgentTask> = {}): CursorAgentTask => ({
    id: "bc_test123",
    sessionKey: "session_abc",
    accountId: "default",
    instructions: "Fix the bug",
    repository: "https://github.com/test/repo",
    branch: "main",
    status: "PENDING",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  });

  it("should store and retrieve a task", () => {
    const task = createTask();
    setTask(task);

    const retrieved = getTask(task.id);
    expect(retrieved).toEqual(task);
  });

  it("should return undefined for non-existent task", () => {
    expect(getTask("non_existent")).toBeUndefined();
  });

  it("should update a task", async () => {
    const task = createTask({ updatedAt: Date.now() - 100 }); // Set to past
    setTask(task);

    // Small delay to ensure different timestamp
    await new Promise((r) => setTimeout(r, 1));

    const updated = updateTask(task.id, { status: "RUNNING" });

    expect(updated?.status).toBe("RUNNING");
    expect(updated?.updatedAt).toBeGreaterThanOrEqual(task.updatedAt);
  });

  it("should return null when updating non-existent task", () => {
    expect(updateTask("non_existent", { status: "RUNNING" })).toBeNull();
  });

  it("should delete a task", () => {
    const task = createTask();
    setTask(task);

    expect(deleteTask(task.id)).toBe(true);
    expect(getTask(task.id)).toBeUndefined();
  });

  it("should return false when deleting non-existent task", () => {
    expect(deleteTask("non_existent")).toBe(false);
  });

  it("should get tasks for a session", () => {
    const task1 = createTask({ id: "bc_1", sessionKey: "session_a" });
    const task2 = createTask({ id: "bc_2", sessionKey: "session_b" });
    const task3 = createTask({ id: "bc_3", sessionKey: "session_a" });

    setTask(task1);
    setTask(task2);
    setTask(task3);

    const sessionTasks = getTasksForSession("session_a");
    expect(sessionTasks).toHaveLength(2);
    expect(sessionTasks.map((t) => t.id)).toContain("bc_1");
    expect(sessionTasks.map((t) => t.id)).toContain("bc_3");
  });

  it("should get pending tasks", () => {
    const task1 = createTask({ id: "bc_1", status: "PENDING" });
    const task2 = createTask({ id: "bc_2", status: "RUNNING" });
    const task3 = createTask({ id: "bc_3", status: "FINISHED" });

    setTask(task1);
    setTask(task2);
    setTask(task3);

    const pending = getPendingTasks();
    expect(pending).toHaveLength(2);
    expect(pending.map((t) => t.id)).toContain("bc_1");
    expect(pending.map((t) => t.id)).toContain("bc_2");
  });

  it("should get task store singleton", () => {
    const store1 = getTaskStore();
    const store2 = getTaskStore();
    expect(store1).toBe(store2);
  });
});
