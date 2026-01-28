import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { COLOR_THEMES, type ColorTheme } from "../theme";
import "./icon";

@customElement("theme-selector")
export class ThemeSelector extends LitElement {
  @property({ type: String }) colorTheme: ColorTheme = "tangerine";
  @state() private isOpen = false;

  static styles = css`
    :host {
      position: relative;
      display: inline-block;
    }

    .trigger {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--border);
      border-radius: var(--radius-full);
      background: var(--secondary);
      color: var(--muted);
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .trigger:hover {
      color: var(--text);
      background: var(--bg-hover);
      border-color: var(--border-strong);
    }

    .dropdown {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      min-width: 180px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-lg);
      padding: 6px;
      z-index: 100;
      opacity: 0;
      transform: translateY(-4px);
      pointer-events: none;
      transition: all 0.2s ease;
    }

    .dropdown.open {
      opacity: 1;
      transform: translateY(0);
      pointer-events: all;
    }

    .dropdown-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: background 0.15s ease;
      border: none;
      background: transparent;
      width: 100%;
      text-align: left;
      color: var(--text);
      font-size: 13px;
      font-weight: 500;
    }

    .dropdown-item:hover {
      background: var(--bg-hover);
    }

    .dropdown-item.active {
      background: var(--accent-subtle);
      color: var(--accent);
    }

    .color-preview {
      width: 16px;
      height: 16px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border);
      flex-shrink: 0;
    }

    /* Light mode */
    :host-context([data-theme="light"]) .trigger {
      background: white;
      border-color: var(--border);
    }

    :host-context([data-theme="light"]) .trigger:hover {
      background: var(--bg-hover);
    }

    :host-context([data-theme="light"]) .dropdown {
      background: white;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    :host-context([data-theme="light"]) .dropdown-item:hover {
      background: var(--bg-hover);
    }

    /* Mobile optimization */
    @media (max-width: 600px) {
      .trigger {
        width: 26px;
        height: 26px;
      }

      .dropdown {
        min-width: 160px;
        padding: 4px;
      }

      .dropdown-item {
        padding: 6px 8px;
        font-size: 12px;
      }

      .color-preview {
        width: 14px;
        height: 14px;
      }
    }

    @media (max-width: 400px) {
      .trigger {
        width: 24px;
        height: 24px;
      }

      .dropdown {
        min-width: 140px;
      }

      .dropdown-item {
        padding: 5px 7px;
        font-size: 11px;
        gap: 8px;
      }

      .color-preview {
        width: 12px;
        height: 12px;
      }
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("click", this.handleOutsideClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("click", this.handleOutsideClick);
  }

  private handleOutsideClick = (e: MouseEvent) => {
    if (!this.contains(e.target as Node)) {
      this.isOpen = false;
    }
  };

  private toggleDropdown(e: Event) {
    e.stopPropagation();
    this.isOpen = !this.isOpen;
  }

  private selectTheme(theme: ColorTheme) {
    this.dispatchEvent(new CustomEvent("change", {
      detail: { colorTheme: theme },
      bubbles: true,
      composed: true
    }));
    this.isOpen = false;
  }

  render() {
    return html`
      <button class="trigger" @click=${this.toggleDropdown} title="Change color theme">
        <ui-icon name="moreVertical" .size=${14}></ui-icon>
      </button>
      <div class="dropdown ${this.isOpen ? 'open' : ''}">
        ${Object.entries(COLOR_THEMES).map(([key, { name, preview }]) => html`
          <button
            class="dropdown-item ${key === this.colorTheme ? 'active' : ''}"
            @click=${() => this.selectTheme(key as ColorTheme)}
          >
            <div class="color-preview" style="background-color: ${preview};"></div>
            <span>${name}</span>
          </button>
        `)}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "theme-selector": ThemeSelector;
  }
}
