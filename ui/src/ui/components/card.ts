
import { LitElement, html, css } from "lit";
import { customElement } from "lit/decorators.js";

@customElement("ui-card")
export class UiCard extends LitElement {
    static styles = css`
    :host {
      display: block;
    }

    .card {
      border: 1px solid var(--border, #3E3B38);
      background: var(--card, #1A1816);
      border-radius: var(--radius-lg, 12px);
      box-shadow: var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.1));
      overflow: hidden;
      transition: all 0.2s ease;
    }

    .card:hover {
      border-color: var(--border-strong, #57534E);
      box-shadow: var(--shadow-md, 0 4px 6px -1px rgba(0,0,0,0.1));
    }

    .card-header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border, #3E3B38);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .card-header:not(:has(*)) {
      display: none;
    }

    .card-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--foreground, #EDE9E6);
      margin: 0;
    }

    .card-desc {
      font-size: 13px;
      color: var(--muted-foreground, #A8A29D);
      margin-top: 4px;
    }

    .card-content {
      padding: 20px;
    }

    .card-footer {
      padding: 16px 20px;
      border-top: 1px solid var(--border, #3E3B38);
      background: var(--bg-muted, #1F1D1B);
      display: flex;
      align-items: center;
    }

    /* Light mode styles */
    :host-context([data-theme="light"]) .card {
      background: var(--card, #FFFFFF);
      border-color: var(--border, #e4e4e7);
    }

    :host-context([data-theme="light"]) .card:hover {
      border-color: var(--border-strong, #d4d4d8);
    }

    :host-context([data-theme="light"]) .card-header {
      border-bottom-color: var(--border, #e4e4e7);
    }

    :host-context([data-theme="light"]) .card-title {
      color: var(--foreground, #1A1410);
    }

    :host-context([data-theme="light"]) .card-desc {
      color: var(--muted-foreground, #71717a);
    }

    :host-context([data-theme="light"]) .card-footer {
      border-top-color: var(--border, #e4e4e7);
      background: var(--bg-muted, #EFEEE9);
    }
  `;

    render() {
        return html`
      <div class="card">
        <div class="card-header">
          <slot name="header"></slot>
        </div>
        <div class="card-content">
          <slot></slot>
        </div>
        <slot name="footer"></slot>
      </div>
    `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "ui-card": UiCard;
    }
}
