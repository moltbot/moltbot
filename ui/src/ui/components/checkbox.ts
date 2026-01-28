
import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import "./icon";

@customElement("ui-checkbox")
export class UiCheckbox extends LitElement {
    @property({ type: Boolean }) checked = false;
    @property({ type: Boolean }) disabled = false;
    @property({ type: String }) label = "";

    static styles = css`
    :host {
      display: inline-flex;
      vertical-align: middle;
    }

    .wrapper {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      user-select: none;
    }

    .wrapper.disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .checkbox {
      width: 18px;
      height: 18px;
      border: 1px solid var(--input-border, #3E3B38);
      border-radius: var(--radius-sm, 4px);
      background: var(--input-bg, #1A1816);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      color: white;
    }

    .wrapper:hover .checkbox {
      border-color: var(--accent, #FF9F40);
      background: rgba(255, 159, 64, 0.1);
    }

    .wrapper.checked .checkbox {
      background: var(--accent, #FF9F40);
      border-color: var(--accent, #FF9F40);
    }

    /* Light mode */
    :host-context([data-theme="light"]) .checkbox {
      background: white;
    }

    :host-context([data-theme="light"]) .wrapper:hover .checkbox {
      background: rgba(255, 159, 64, 0.1);
    }

    :host-context([data-theme="light"]) .wrapper.checked .checkbox {
      background: var(--accent, #FF9F40);
    }

    .label {
      font-size: 14px;
      color: var(--foreground, #EDE9E6);
    }

    :host-context([data-theme="light"]) .label {
      color: var(--foreground, #1A1410);
    }
  `;

    toggle() {
        if (this.disabled) return;
        this.checked = !this.checked;
        this.dispatchEvent(new CustomEvent("change", {
            detail: { checked: this.checked },
            bubbles: true,
            composed: true
        }));
    }

    render() {
        return html`
      <div 
        class="wrapper ${this.checked ? 'checked' : ''} ${this.disabled ? 'disabled' : ''}"
        @click=${this.toggle}
      >
        <div class="checkbox">
          ${this.checked ? html`<ui-icon name="check" .size=${12} strokeWidth="3"></ui-icon>` : null}
        </div>
        ${this.label ? html`<span class="label">${this.label}</span>` : null}
      </div>
    `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "ui-checkbox": UiCheckbox;
    }
}
