
import { LitElement, html, css } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import "./icon";

@customElement("ui-input")
export class UiInput extends LitElement {
    @property({ type: String }) type = "text";
    @property({ type: String }) placeholder = "";
    @property({ type: String }) value = "";
    @property({ type: String }) label = "";
    @property({ type: String }) error = "";
    @property({ type: Boolean }) disabled = false;
    @property({ type: String }) icon?: string;

    @query("input") inputElement!: HTMLInputElement;

    static styles = css`
    :host {
      display: block;
      width: 100%;
    }

    .input-wrapper {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .label {
      font-size: 13px;
      font-weight: 500;
      color: var(--muted-foreground, #A8A29D);
    }

    .input-container {
      position: relative;
      display: flex;
      align-items: center;
    }

    input {
      width: 100%;
      height: 36px;
      padding: 0 12px;
      padding-left: var(--input-padding-left, 12px);
      background: var(--input-bg, #1A1816);
      border: 1px solid var(--input-border, #3E3B38);
      border-radius: var(--radius-md, 6px);
      color: var(--foreground, #EDE9E6);
      font-family: inherit;
      font-size: 14px;
      outline: none;
      transition: all 0.2s ease;
    }

    input:focus {
      border-color: var(--accent, #FF9F40);
      box-shadow: 0 0 0 2px var(--accent-subtle, rgba(255, 159, 64, 0.1));
    }

    input:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Light mode */
    :host-context([data-theme="light"]) input {
      background: white;
      color: var(--foreground);
    }

    :host-context([data-theme="light"]) input:focus {
      background: white;
    }

    .has-icon input {
      padding-left: 36px;
    }

    .icon {
      position: absolute;
      left: 10px;
      color: var(--muted-foreground, #A8A29D);
      pointer-events: none;
      display: flex;
      align-items: center;
    }

    .error-msg {
      font-size: 12px;
      color: var(--danger, #EF4444);
    }

    .input-error input {
      border-color: var(--danger, #EF4444);
    }
  `;

    handleInput(e: Event) {
        const target = e.target as HTMLInputElement;
        this.value = target.value;
        this.dispatchEvent(new CustomEvent("input", {
            detail: { value: this.value },
            bubbles: true,
            composed: true
        }));
    }

    handleChange(e: Event) {
        const target = e.target as HTMLInputElement;
        this.value = target.value;
        this.dispatchEvent(new CustomEvent("change", {
            detail: { value: this.value },
            bubbles: true,
            composed: true
        }));
    }

    render() {
        return html`
      <div class="input-wrapper ${this.error ? 'input-error' : ''}">
        ${this.label ? html`<label class="label">${this.label}</label>` : null}
        
        <div class="input-container ${this.icon ? 'has-icon' : ''}">
          ${this.icon ? html`<ui-icon class="icon" .name=${this.icon} .size=${16}></ui-icon>` : null}
          <input
            .type=${this.type}
            .value=${this.value}
            .placeholder=${this.placeholder}
            ?disabled=${this.disabled}
            @input=${this.handleInput}
            @change=${this.handleChange}
          />
        </div>

        ${this.error ? html`<span class="error-msg">${this.error}</span>` : null}
      </div>
    `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "ui-input": UiInput;
    }
}
