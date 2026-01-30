export type TaskColumnId = "todo" | "doing" | "done" | "blocked";

export type TaskChecklistItem = {
  id: string;
  text: string;
  done: boolean;
};

export type TaskEntity = {
  id: string;
  name: string;
  description: string;
  createdAtMs: number;
  updatedAtMs: number;

  // Optional/expandable fields
  priority?: number; // 1-5
  dueAtMs?: number | null;
  tags?: string[];
  links?: string[];
  checklist?: TaskChecklistItem[];
  // When a task is blocked, record why.
  blockReason?: string;
  extras?: Record<string, unknown>;
};

export type TaskBoard = {
  version: 3;
  updatedAtMs: number;
  tasksById: Record<string, TaskEntity>;
  columns: Record<TaskColumnId, string[]>; // arrays of task ids
};

export const DEFAULT_TASK_BOARD: TaskBoard = {
  version: 3,
  updatedAtMs: 0,
  tasksById: {},
  columns: {
    todo: [],
    doing: [],
    done: [],
    blocked: [],
  },
};
