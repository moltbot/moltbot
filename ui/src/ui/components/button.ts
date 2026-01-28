
import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import "./icon";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

@customElement("ui-button")
export class UiButton extends LitElement {
    @property({ type: String }) variant: ButtonVariant = "secondary";
    @property({ type: String }) size: ButtonSize = "md";
    @property({ type: Boolean }) disabled = false;
    @property({ type: Boolean }) loading = false;
    @property({ type: String }) icon?: string;
    @property({ type: String }) href?: string;
    @property({ type: String }) target?: string;
    @property({ type: String }) type: "button" | "submit" | "reset" = "button";

    static styles = css`
    :host {
      display: inline-block;
      vertical-align: middle;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border: 1px solid transparent;
      border-radius: var(--radius-md, 6px);
      cursor: pointer;
      font-family: inherit;
      font-weight: 500;
      line-height: 1;
      text-decoration: none;
      transition: all 0.2s ease;
      white-space: nowrap;
      position: relative;
    }

    .btn:focus-visible {
      outline: 2px solid var(--accent, #FF9F40);
      outline-offset: 2px;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      pointer-events: none;
    }

    /* Sizes */
    .size-sm {
      height: 28px;
      padding: 0 10px;
      font-size: 12px;
    }
    .size-md {
      height: 36px;
      padding: 0 16px;
      font-size: 14px;
    }
    .size-lg {
      height: 44px;
      padding: 0 24px;
      font-size: 16px;
    }
    .size-icon {
      height: 36px;
      width: 36px;
      padding: 0;
    }
    .size-icon.size-sm {
      height: 28px;
      width: 28px;
    }

    /* Variants */
    .variant-primary {
      background-color: var(--accent, #FF9F40);
      color: var(--primary-foreground, #fff);
      border-color: var(--accent, #FF9F40);
    }
    .variant-primary:hover {
      background-color: var(--accent-hover, #F97316);
      border-color: var(--accent-hover, #F97316);
    }

    .variant-secondary {
      background-color: var(--secondary, #2A2723);
      color: var(--secondary-foreground, #EDE9E6);
      border-color: var(--border, #3E3B38);
    }
    .variant-secondary:hover {
      background-color: var(--secondary-hover, #3E3B38);
      border-color: var(--border-strong, #57534E);
    }

    .variant-outline {
      background-color: transparent;
      border-color: var(--border, #3E3B38);
      color: var(--foreground, #EDE9E6);
    }
    .variant-outline:hover {
      background-color: var(--secondary, #2A2723);
      border-color: var(--border-strong, #57534E);
    }

    .variant-ghost {
      background-color: transparent;
      color: var(--muted-foreground, #A8A29D);
    }
    .variant-ghost:hover {
      background-color: var(--secondary, #2A2723);
      color: var(--foreground, #EDE9E6);
    }

    .variant-danger {
      background-color: var(--danger, #EF4444);
      color: white;
    }
    .variant-danger:hover {
      background-color: var(--danger-hover, #DC2626);
    }

    /* Light mode overrides */
    :host-context([data-theme="light"]) .variant-secondary {
      background-color: white;
      color: var(--foreground);
      border-color: var(--border);
    }
    :host-context([data-theme="light"]) .variant-secondary:hover {
      background-color: var(--bg-hover);
    }

    :host-context([data-theme="light"]) .variant-outline {
      color: var(--foreground);
    }
    :host-context([data-theme="light"]) .variant-outline:hover {
      background-color: var(--bg-hover);
    }

    :host-context([data-theme="light"]) .variant-ghost:hover {
      background-color: var(--bg-hover);
    }

    /* Loading Spinner */
    .spinner {
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;

    render() {
        const classes = {
            btn: true,
            [`variant-${this.variant}`]: true,
            [`size-${this.size}`]: true,
            loading: this.loading,
        };

        const content = html`
      ${this.loading
                ? html`<ui-icon name="loader" class="spinner" .size=${this.size === "sm" ? 14 : 16}></ui-icon>`
                : this.icon
                    ? html`<ui-icon .name=${this.icon} .size=${this.size === "sm" ? 14 : 16}></ui-icon>`
                    : null}
      <slot></slot>
    `;

        if (this.href) {
            return html`
        <a 
          class=${classMap(classes)} 
          href=${this.href} 
          target=${this.target || "_self"}
          ?disabled=${this.disabled}
        >
          ${content}
        </a>
      `;
        }

        return html`
      <button
        class=${classMap(classes)}
        type=${this.type}
        ?disabled=${this.disabled || this.loading}
      >
        ${content}
      </button>
    `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "ui-button": UiButton;
    }
}
