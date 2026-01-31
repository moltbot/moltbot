import { html, nothing } from "lit";
import type { SecretMetadata } from "../controllers/secrets";

export type SecretsProps = {
  loading: boolean;
  secrets: SecretMetadata[];
  error: string | null;
  busyKey: string | null;
  message: { kind: "success" | "error"; message: string } | null;
  showAddForm: boolean;
  editName: string;
  editValue: string;
  editDescription: string;
  onRefresh: () => void;
  onRemove: (name: string) => void;
  onShowAddForm: () => void;
  onHideAddForm: () => void;
  onSave: () => void;
  onNameChange: (value: string) => void;
  onValueChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function renderSecrets(props: SecretsProps) {
  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Secrets</div>
          <div class="card-sub">
            Environment variables available to agent commands. Values never reach the model.
          </div>
        </div>
        <div class="row" style="gap: 8px;">
          <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
            ${props.loading ? "Loading…" : "Refresh"}
          </button>
          <button class="btn btn-primary" @click=${props.onShowAddForm}>
            Add Secret
          </button>
        </div>
      </div>

      ${props.message
        ? html`
            <div class="callout ${props.message.kind === "error" ? "danger" : "success"}" style="margin-top: 12px;">
              ${props.message.message}
            </div>
          `
        : nothing}

      ${props.error
        ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
        : nothing}

      ${props.showAddForm ? renderAddForm(props) : nothing}

      ${props.secrets.length === 0 && !props.loading
        ? html`
            <div class="muted" style="margin-top: 16px;">
              No secrets configured. Add one to make it available as an environment variable.
            </div>
          `
        : html`
            <div class="list" style="margin-top: 16px;">
              ${props.secrets.map((secret) => renderSecret(secret, props))}
            </div>
          `}

      <div class="callout info" style="margin-top: 16px;">
        <strong>How it works:</strong> Secrets are injected as environment variables when the agent
        runs commands. The agent sees only the variable names (e.g., <code>$GITHUB_TOKEN</code>),
        never the actual values.
      </div>
    </section>
  `;
}

function renderAddForm(props: SecretsProps) {
  return html`
    <div class="card" style="margin-top: 16px; background: var(--bg-muted);">
      <div class="card-title">Add Secret</div>
      <div class="fields" style="margin-top: 12px;">
        <label class="field">
          <span>Name</span>
          <input
            type="text"
            placeholder="GITHUB_TOKEN"
            .value=${props.editName}
            @input=${(e: Event) => props.onNameChange((e.target as HTMLInputElement).value)}
            autocomplete="off"
          />
          <small class="muted">Use UPPER_SNAKE_CASE</small>
        </label>
        <label class="field">
          <span>Value</span>
          <input
            type="password"
            placeholder="Secret value"
            .value=${props.editValue}
            @input=${(e: Event) => props.onValueChange((e.target as HTMLInputElement).value)}
            autocomplete="off"
          />
        </label>
        <label class="field">
          <span>Description (optional)</span>
          <input
            type="text"
            placeholder="What this secret is for"
            .value=${props.editDescription}
            @input=${(e: Event) => props.onDescriptionChange((e.target as HTMLInputElement).value)}
          />
        </label>
      </div>
      <div class="row" style="gap: 8px; margin-top: 12px;">
        <button class="btn btn-primary" @click=${props.onSave} ?disabled=${props.busyKey !== null}>
          ${props.busyKey ? "Saving…" : "Save"}
        </button>
        <button class="btn" @click=${props.onHideAddForm}>Cancel</button>
      </div>
    </div>
  `;
}

function renderSecret(secret: SecretMetadata, props: SecretsProps) {
  const busy = props.busyKey === secret.name;
  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">
          <code>$${secret.name}</code>
        </div>
        ${secret.description
          ? html`<div class="list-sub">${secret.description}</div>`
          : nothing}
        <div class="chip-row" style="margin-top: 6px;">
          <span class="chip">Updated: ${formatDate(secret.updatedAt)}</span>
        </div>
      </div>
      <div class="list-actions">
        <button
          class="btn btn-danger btn-small"
          ?disabled=${busy}
          @click=${() => props.onRemove(secret.name)}
        >
          ${busy ? "…" : "Remove"}
        </button>
      </div>
    </div>
  `;
}
