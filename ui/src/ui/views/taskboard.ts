import { html, nothing } from "lit";

import type { TaskBoard, TaskColumnId, TaskEntity, TaskChecklistItem } from "../types/task-board";
import { icons } from "../icons";

export type TaskBoardViewProps = {
  loading: boolean;
  saving: boolean;
  error: string | null;
  path: string | null;
  board: TaskBoard;

  onRefresh: () => void;
  onAdd: (column: TaskColumnId, payload: { name: string; description: string }) => void;
  onDelete: (taskId: string) => void;
  onMove: (taskId: string, from: TaskColumnId, to: TaskColumnId) => void;
  onUpdate: (taskId: string, patch: Partial<TaskEntity>) => void;
  onUpdateChecklist: (taskId: string, checklist: TaskChecklistItem[]) => void;
};

export function renderTaskBoardView(props: TaskBoardViewProps) {
  const columns: Array<{ id: TaskColumnId; title: string }> = [
    { id: "todo", title: "未完成" },
    { id: "doing", title: "进行中" },
    { id: "done", title: "已完成" },
    { id: "blocked", title: "Blocked" },
  ];

  const onDropColumn = (e: DragEvent, to: TaskColumnId) => {
    e.preventDefault();
    const raw = e.dataTransfer?.getData("application/json") ?? "";
    try {
      const parsed = JSON.parse(raw) as { taskId?: unknown; from?: unknown };
      const taskId = typeof parsed.taskId === "string" ? parsed.taskId : "";
      const from = typeof parsed.from === "string" ? (parsed.from as TaskColumnId) : null;
      if (!taskId || !from) return;
      props.onMove(taskId, from, to);
    } catch {
      return;
    }
  };

  return html`
    <div class="taskboard">
      <div class="taskboard__header">
        <div>
          <div class="taskboard__title">TaskBoard</div>
          <div class="taskboard__sub">本地存储 · 可扩展任务看板</div>
        </div>
        <div class="taskboard__actions">
          <button class="btn" type="button" @click=${props.onRefresh} title="Refresh">
            ↻
          </button>
        </div>
      </div>

      ${props.error
        ? html`<div class="callout danger">${props.error}</div>`
        : nothing}
      ${props.loading ? html`<div class="muted">Loading…</div>` : nothing}
      ${props.saving ? html`<div class="muted">Saving…</div>` : nothing}
      ${props.path ? html`<div class="muted taskboard__path">${props.path}</div>` : nothing}

      <div class="taskboard__grid">
        ${columns.map((col) => {
          const ids = props.board.columns[col.id] ?? [];
          const tasks = ids
            .map((id) => props.board.tasksById[id])
            .filter(Boolean) as TaskEntity[];
          return html`
            <div
              class="taskboard-col"
              @dragover=${(e: DragEvent) => e.preventDefault()}
              @drop=${(e: DragEvent) => onDropColumn(e, col.id)}
            >
              <div class="taskboard-col__header">
                <div class="taskboard-col__title">${col.title}</div>
                <div class="taskboard-col__count">${tasks.length}</div>
              </div>

              <form
                class="taskboard-col__add"
                @submit=${(e: Event) => {
                  e.preventDefault();
                  const form = e.currentTarget as HTMLFormElement;
                  const nameInput = form.querySelector(
                    "input[name=task-name]",
                  ) as HTMLInputElement | null;
                  const descInput = form.querySelector(
                    "textarea[name=task-desc]",
                  ) as HTMLTextAreaElement | null;
                  const name = nameInput?.value ?? "";
                  const description = descInput?.value ?? "";
                  if (!name.trim()) return;
                  props.onAdd(col.id, { name, description });
                  if (nameInput) nameInput.value = "";
                  if (descInput) descInput.value = "";
                }}
              >
                <input
                  class="input"
                  name="task-name"
                  type="text"
                  placeholder="任务名称"
                />
                <textarea
                  class="input textarea"
                  name="task-desc"
                  placeholder="描述（可选）"
                  rows="2"
                ></textarea>
                <button class="btn primary" type="submit">新增</button>
              </form>

              <div class="taskboard-col__list">
                ${tasks.map((t) => renderTaskItem(props, t, col.id))}
              </div>
            </div>
          `;
        })}
      </div>
    </div>
  `;
}

function renderTaskItem(
  props: TaskBoardViewProps,
  task: TaskEntity,
  column: TaskColumnId,
) {
  const tags = Array.isArray(task.tags) ? task.tags.join(", ") : "";
  const links = Array.isArray(task.links) ? task.links.join("\n") : "";
  const checklist = Array.isArray(task.checklist) ? task.checklist : [];
  const due = typeof task.dueAtMs === "number" ? new Date(task.dueAtMs).toISOString().slice(0, 10) : "";
  const blockReason = (task.blockReason ?? "").trim();

  return html`
    <details class="task" @toggle=${(e: Event) => {
      // No-op: allows click-to-expand without extra state.
      void e;
    }}>
      <summary
        class="task__summary"
        draggable="true"
        @dragstart=${(e: DragEvent) => {
          e.dataTransfer?.setData(
            "application/json",
            JSON.stringify({ taskId: task.id, from: column }),
          );
          e.dataTransfer!.effectAllowed = "move";
        }}
      >
        <div class="task__summary-main">
          <div class="task__name">${task.name}</div>
          ${task.description
            ? html`<div class="task__desc">${task.description}</div>`
            : nothing}
          ${column === "blocked" && blockReason
            ? html`<div class="task__blocked">Blocked: ${blockReason}</div>`
            : nothing}
        </div>
        <div class="task__summary-actions">
          <button
            class="btn"
            type="button"
            title="Delete"
            @click=${(e: Event) => {
              e.preventDefault();
              e.stopPropagation();
              props.onDelete(task.id);
            }}
          >
            ${icons.x}
          </button>
        </div>
      </summary>

      <div class="task__details">
        <label class="field">
          <div class="field__label">名称</div>
          <input
            class="input"
            type="text"
            .value=${task.name}
            @change=${(e: Event) =>
              props.onUpdate(task.id, { name: (e.target as HTMLInputElement).value })}
          />
        </label>

        <label class="field">
          <div class="field__label">描述</div>
          <textarea
            class="input textarea"
            rows="4"
            .value=${task.description ?? ""}
            @change=${(e: Event) =>
              props.onUpdate(task.id, {
                description: (e.target as HTMLTextAreaElement).value,
              })}
          ></textarea>
        </label>

        <div class="task__row">
          <label class="field">
            <div class="field__label">优先级 (1-5)</div>
            <input
              class="input"
              type="number"
              min="1"
              max="5"
              .value=${String(task.priority ?? "")}
              @change=${(e: Event) => {
                const v = Number((e.target as HTMLInputElement).value);
                props.onUpdate(task.id, { priority: Number.isFinite(v) ? v : undefined });
              }}
            />
          </label>
          <label class="field">
            <div class="field__label">截止日期</div>
            <input
              class="input"
              type="date"
              .value=${due}
              @change=${(e: Event) => {
                const v = (e.target as HTMLInputElement).value;
                const ms = v ? new Date(v + "T00:00:00Z").getTime() : null;
                props.onUpdate(task.id, { dueAtMs: ms });
              }}
            />
          </label>
        </div>

        <label class="field">
          <div class="field__label">标签 (逗号分隔)</div>
          <input
            class="input"
            type="text"
            .value=${tags}
            @change=${(e: Event) => {
              const raw = (e.target as HTMLInputElement).value;
              const arr = raw
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              props.onUpdate(task.id, { tags: arr });
            }}
          />
        </label>

        <label class="field">
          <div class="field__label">Links (每行一个)</div>
          <textarea
            class="input textarea"
            rows="3"
            .value=${links}
            @change=${(e: Event) => {
              const raw = (e.target as HTMLTextAreaElement).value;
              const arr = raw
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean);
              props.onUpdate(task.id, { links: arr });
            }}
          ></textarea>
        </label>

        <label class="field">
          <div class="field__label">Blocked 原因</div>
          <textarea
            class="input textarea"
            rows="3"
            .value=${blockReason}
            @change=${(e: Event) =>
              props.onUpdate(task.id, {
                blockReason: (e.target as HTMLTextAreaElement).value,
              })}
          ></textarea>
        </label>

        <div class="field">
          <div class="field__label">Checklist</div>
          <div class="checklist">
            ${checklist.map(
              (c) => html`
                <label class="checklist__item">
                  <input
                    type="checkbox"
                    .checked=${c.done}
                    @change=${(e: Event) => {
                      const done = (e.target as HTMLInputElement).checked;
                      const next = checklist.map((x) =>
                        x.id === c.id ? { ...x, done } : x,
                      );
                      props.onUpdateChecklist(task.id, next);
                    }}
                  />
                  <input
                    class="input checklist__text"
                    type="text"
                    .value=${c.text}
                    @change=${(e: Event) => {
                      const text = (e.target as HTMLInputElement).value;
                      const next = checklist.map((x) =>
                        x.id === c.id ? { ...x, text } : x,
                      );
                      props.onUpdateChecklist(task.id, next);
                    }}
                  />
                  <button
                    class="btn"
                    type="button"
                    title="Remove"
                    @click=${() => {
                      const next = checklist.filter((x) => x.id !== c.id);
                      props.onUpdateChecklist(task.id, next);
                    }}
                  >
                    ${icons.x}
                  </button>
                </label>
              `,
            )}

            <button
              class="btn"
              type="button"
              @click=${() => {
                const id = crypto.randomUUID();
                const next: TaskChecklistItem[] = [
                  ...checklist,
                  { id, text: "", done: false },
                ];
                props.onUpdateChecklist(task.id, next);
              }}
            >
              + Add item
            </button>
          </div>
        </div>
      </div>
    </details>
  `;
}
