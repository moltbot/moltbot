
import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("ui-switch")
export class UiSwitch extends LitElement {
    @property({ type: Boolean }) checked = false;
    @property({ type: Boolean }) disabled = false;

    static styles = css`
    :host {
      display: inline-block;
      vertical-align: middle;
    }

    input {
      display: none;
    }

    .track {
      width: 36px;
      height: 20px;
      background: var(--input-bg, #2A2723);
      border: 1px solid var(--input-border, #3E3B38);
      border-radius: 999px;
      position: relative;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .track.checked {
      background: var(--accent, #FF9F40);
      border-color: var(--accent, #FF9F40);
    }

    .thumb {
      width: 16px;
      height: 16px;
      background: #A8A29D;
      border-radius: 50%;
      position: absolute;
      top: 1px;
      left: 1px;
      transition: transform 0.2s cubic-bezier(0.4, 0.0, 0.2, 1);
      box-shadow: 0 1px 2px rgba(0,0,0,0.2);
    }

    .track.checked .thumb {
      background: white;
      transform: translateX(16px);
    }

    .track.disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Light mode styles */
    :host-context([data-theme="light"]) .track {
      background: var(--input-bg, #F5F4F2);
      border-color: var(--input-border, #e4e4e7);
    }

    :host-context([data-theme="light"]) .track.checked {
      background: var(--accent, #FF8C42);
      border-color: var(--accent, #FF8C42);
    }

    :host-context([data-theme="light"]) .thumb {
      background: #71717a;
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
        class="track ${this.checked ? 'checked' : ''} ${this.disabled ? 'disabled' : ''}"
        @click=${this.toggle}
      >
        <div class="thumb"></div>
      </div>
    `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "ui-switch": UiSwitch;
    }
}
