
import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("ui-tooltip")
export class UiTooltip extends LitElement {
    @property({ type: String }) content = "";

    static styles = css`
    :host {
      position: relative;
      display: inline-block;
    }

    .tooltip {
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%) translateY(8px) scale(0.95);
      background: var(--tooltip-bg, #1A1816);
      color: var(--tooltip-fg, #EDE9E6);
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 12px;
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: all 0.15s ease;
      border: 1px solid var(--border, #3E3B38);
      box-shadow: var(--shadow-md, 0 4px 6px -1px rgba(0,0,0,0.1));
      z-index: 50;
    }

    /* Arrow */
    .tooltip::after {
      content: "";
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      border-width: 4px;
      border-style: solid;
      border-color: var(--tooltip-bg, #1A1816) transparent transparent transparent;
    }

    :host(:hover) .tooltip {
      opacity: 1;
      transform: translateX(-50%) translateY(-8px) scale(1);
    }

    /* Light mode styles */
    :host-context([data-theme="light"]) .tooltip {
      background: var(--tooltip-bg, #FFFFFF);
      color: var(--tooltip-fg, #1A1410);
      border-color: var(--border, #e4e4e7);
    }

    :host-context([data-theme="light"]) .tooltip::after {
      border-color: var(--tooltip-bg, #FFFFFF) transparent transparent transparent;
    }
  `;

    render() {
        return html`
      <slot></slot>
      <div class="tooltip">${this.content}</div>
    `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "ui-tooltip": UiTooltip;
    }
}
