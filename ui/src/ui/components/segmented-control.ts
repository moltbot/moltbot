
import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

export interface SegmentonedOption {
    label: string;
    value: string;
}

@customElement("ui-segmented-control")
export class UiSegmentedControl extends LitElement {
    @property({ type: Array }) options: SegmentonedOption[] = [];
    @property({ type: String }) value = "";

    static styles = css`
    :host {
      display: inline-flex;
      background: var(--input-bg, #2A2723);
      padding: 3px; // slightly smaller padding for tighter look
      border-radius: var(--radius-md, 8px);
      border: 1px solid var(--border, #3E3B38);
    }

    .segment {
      padding: 6px 14px;
      font-size: 13px;
      font-weight: 500;
      color: var(--muted-foreground, #A8A29D);
      border-radius: var(--radius-sm, 6px);
      cursor: pointer;
      transition: all 0.2s ease;
      user-select: none;
      text-align: center;
      flex: 1;
    }

    .segment:hover {
      color: var(--foreground, #EDE9E6);
      background: rgba(255, 255, 255, 0.03);
    }

    .segment.active {
      background: var(--card, #1A1816);
      color: var(--foreground, #EDE9E6);
      box-shadow: 0 1px 2px rgba(0,0,0,0.2);
    }

    /* Light mode styles */
    :host-context([data-theme="light"]) {
      background: var(--input-bg, #F5F4F2);
      border-color: var(--border, #e4e4e7);
    }

    :host-context([data-theme="light"]) .segment {
      color: var(--muted-foreground, #71717a);
    }

    :host-context([data-theme="light"]) .segment:hover {
      color: var(--foreground, #1A1410);
      background: rgba(0, 0, 0, 0.03);
    }

    :host-context([data-theme="light"]) .segment.active {
      background: var(--card, #FFFFFF);
      color: var(--foreground, #1A1410);
      box-shadow: 0 1px 2px rgba(0,0,0,0.06);
    }
  `;

    select(val: string) {
        if (this.value === val) return;
        this.value = val;
        this.dispatchEvent(new CustomEvent("change", {
            detail: { value: this.value },
            bubbles: true,
            composed: true
        }));
    }

    render() {
        return html`
      ${this.options.map(opt => html`
        <div 
          class="segment ${opt.value === this.value ? 'active' : ''}"
          @click=${() => this.select(opt.value)}
        >
          ${opt.label}
        </div>
      `)}
    `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "ui-segmented-control": UiSegmentedControl;
    }
}
