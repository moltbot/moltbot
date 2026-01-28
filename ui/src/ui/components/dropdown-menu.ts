import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import "./icon";

export interface DropdownMenuItem {
  label: string;
  value: string;
  variant?: "default" | "danger";
  disabled?: boolean;
}

@customElement("ui-dropdown-menu")
export class UiDropdownMenu extends LitElement {
  @property({ type: Array }) items: DropdownMenuItem[] = [];
  @property({ type: Boolean }) disabled = false;
  @state() private open = false;

  static styles = css`
    :host {
      position: relative;
      display: inline-block;
    }

    .trigger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border: 1px solid var(--border, #3E3B38);
      background: var(--bg-elevated, #1F1D1B);
      padding: 9px 12px;
      border-radius: var(--radius-md, 8px);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      color: var(--text, #EDE9E6);
    }

    .trigger:hover:not(:disabled) {
      background: var(--bg-hover, #2A2826);
      border-color: var(--border-strong, #57534E);
      transform: translateY(-1px);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    }

    .trigger:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .menu {
      position: absolute;
      top: calc(100% + 4px);
      right: 0;
      min-width: 160px;
      background: var(--card, #1A1816);
      border: 1px solid var(--border, #3E3B38);
      border-radius: var(--radius-md, 8px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      padding: 4px;
      z-index: 100;
      opacity: 0;
      transform: translateY(-4px);
      pointer-events: none;
      transition: all 0.15s ease;
    }

    .menu.open {
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }

    .menu-item {
      display: flex;
      align-items: center;
      padding: 8px 12px;
      border-radius: var(--radius-sm, 6px);
      font-size: 13px;
      cursor: pointer;
      transition: background 0.1s ease;
      color: var(--text, #EDE9E6);
      border: none;
      background: transparent;
      width: 100%;
      text-align: left;
    }

    .menu-item:hover:not(:disabled) {
      background: var(--bg-hover, #2A2826);
    }

    .menu-item:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .menu-item.danger {
      color: var(--danger, #EF4444);
    }

    .menu-item.danger:hover:not(:disabled) {
      background: rgba(239, 68, 68, 0.1);
    }

    /* Light mode */
    :host-context([data-theme="light"]) .trigger {
      background: white;
      color: var(--foreground);
    }

    :host-context([data-theme="light"]) .trigger:hover:not(:disabled) {
      background: var(--bg-hover);
    }

    :host-context([data-theme="light"]) .menu {
      background: white;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    :host-context([data-theme="light"]) .menu-item:hover:not(:disabled) {
      background: var(--bg-hover);
    }
  `;

  private handleClickOutside = (e: MouseEvent) => {
    if (!this.contains(e.target as Node)) {
      this.open = false;
    }
  };

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("click", this.handleClickOutside);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("click", this.handleClickOutside);
  }

  private toggleMenu(e: Event) {
    e.stopPropagation();
    if (!this.disabled) {
      this.open = !this.open;
    }
  }

  private handleItemClick(item: DropdownMenuItem, e: Event) {
    e.stopPropagation();
    if (!item.disabled) {
      this.open = false;
      this.dispatchEvent(
        new CustomEvent("select", {
          detail: { value: item.value },
          bubbles: true,
          composed: true,
        })
      );
    }
  }

  render() {
    return html`
      <button
        class="trigger"
        @click=${this.toggleMenu}
        ?disabled=${this.disabled}
        aria-haspopup="true"
        aria-expanded=${this.open}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="1"/>
          <circle cx="12" cy="5" r="1"/>
          <circle cx="12" cy="19" r="1"/>
        </svg>
      </button>
      <div class="menu ${this.open ? "open" : ""}">
        ${this.items.map(
          (item) => html`
            <button
              class="menu-item ${item.variant === "danger" ? "danger" : ""}"
              @click=${(e: Event) => this.handleItemClick(item, e)}
              ?disabled=${item.disabled}
            >
              ${item.label}
            </button>
          `
        )}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ui-dropdown-menu": UiDropdownMenu;
  }
}
