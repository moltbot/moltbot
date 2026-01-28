
import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";

export type BadgeVariant = "default" | "secondary" | "outline" | "destructive" | "success" | "warning";

@customElement("ui-badge")
export class UiBadge extends LitElement {
    @property({ type: String }) variant: BadgeVariant = "default";

    static styles = css`
    :host {
      display: inline-flex;
      vertical-align: middle;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      border-radius: var(--radius-full, 9999px);
      border: 1px solid transparent;
      padding: 2px 8px;
      font-size: 11px;
      font-weight: 600;
      line-height: 1.3;
      transition: colors 0.2s ease;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }

    .variant-default {
      border-color: transparent;
      background-color: var(--accent, #FF9F40);
      color: var(--primary-foreground, #fff);
    }

    .variant-secondary {
      border-color: transparent;
      background-color: var(--secondary, #2A2723);
      color: var(--secondary-foreground, #EDE9E6);
    }

    .variant-outline {
      border-color: var(--border, #3E3B38);
      color: var(--foreground, #EDE9E6);
    }

    .variant-destructive {
      border-color: transparent;
      background-color: var(--danger, #EF4444);
      color: white;
    }

    .variant-success {
      border-color: transparent;
      background-color: var(--ok, #22C55E);
      color: white;
    }

    .variant-warning {
      border-color: transparent;
      background-color: var(--warn, #F59E0B);
      color: white;
    }

    /* Light mode styles */
    :host-context([data-theme="light"]) .variant-default {
      background-color: var(--accent, #FF8C42);
    }

    :host-context([data-theme="light"]) .variant-secondary {
      background-color: var(--secondary, #F5F4F2);
      color: var(--secondary-foreground, #3f3f46);
    }

    :host-context([data-theme="light"]) .variant-outline {
      border-color: var(--border, #e4e4e7);
      color: var(--foreground, #1A1410);
    }

    :host-context([data-theme="light"]) .variant-destructive {
      background-color: var(--danger, #D32F2F);
    }

    :host-context([data-theme="light"]) .variant-success {
      background-color: var(--ok, #2E7D32);
    }

    :host-context([data-theme="light"]) .variant-warning {
      background-color: var(--warn, #F57C00);
    }
  `;

    render() {
        return html`
      <div class=${classMap({ badge: true, [`variant-${this.variant}`]: true })}>
        <slot></slot>
      </div>
    `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "ui-badge": UiBadge;
    }
}
