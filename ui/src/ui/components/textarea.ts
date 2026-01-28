
import { LitElement, html, css } from "lit";
import { customElement, property, query } from "lit/decorators.js";

@customElement("ui-textarea")
export class UiTextarea extends LitElement {
    @property({ type: String }) placeholder = "";
    @property({ type: String }) value = "";
    @property({ type: String }) label = "";
    @property({ type: String }) error = "";
    @property({ type: Boolean }) disabled = false;
    @property({ type: Number }) rows = 4;

    @query("textarea") textareaElement!: HTMLTextAreaElement;

    static styles = css`
    :host {
      display: block;
      width: 100%;
    }

    .textarea-wrapper {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .label {
      font-size: 13px;
      font-weight: 500;
      color: var(--muted-foreground, #A8A29D);
    }

    textarea {
      width: 100%;
      padding: 12px 14px;
      background: var(--input-bg, #1A1816);
      border: 1px solid var(--input-border, #3E3B38);
      border-radius: var(--radius-md, 8px);
      color: var(--foreground, #EDE9E6);
      font-family: var(--font-mono, "JetBrains Mono", monospace);
      font-size: 13px;
      line-height: 1.55;
      outline: none;
      transition: all 0.2s ease;
      resize: vertical;
      min-height: 80px;
    }

    textarea:focus {
      border-color: var(--accent, #FF9F40);
      box-shadow: 0 0 0 2px var(--accent-subtle, rgba(255, 159, 64, 0.1));
    }

    textarea:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Light mode */
    :host-context([data-theme="light"]) textarea {
      background: white;
      color: var(--foreground);
    }

    :host-context([data-theme="light"]) textarea:focus {
      background: white;
    }

    .error-msg {
      font-size: 12px;
      color: var(--danger, #EF4444);
    }

    .textarea-error textarea {
      border-color: var(--danger, #EF4444);
    }
  `;

    handleInput(e: Event) {
        const target = e.target as HTMLTextAreaElement;
        this.value = target.value;
        this.dispatchEvent(new CustomEvent("input", {
            detail: { value: this.value },
            bubbles: true,
            composed: true
        }));
    }

    handleChange(e: Event) {
        const target = e.target as HTMLTextAreaElement;
        this.value = target.value;
        this.dispatchEvent(new CustomEvent("change", {
            detail: { value: this.value },
            bubbles: true,
            composed: true
        }));
    }

    render() {
        return html`
      <div class="textarea-wrapper ${this.error ? 'textarea-error' : ''}">
        ${this.label ? html`<label class="label">${this.label}</label>` : null}
        
        <textarea
          .value=${this.value}
          .placeholder=${this.placeholder}
          .rows=${this.rows}
          ?disabled=${this.disabled}
          @input=${this.handleInput}
          @change=${this.handleChange}
        ></textarea>

        ${this.error ? html`<span class="error-msg">${this.error}</span>` : null}
      </div>
    `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "ui-textarea": UiTextarea;
    }
}
