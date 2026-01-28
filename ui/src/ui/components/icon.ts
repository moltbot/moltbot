
import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import { icons, type IconName } from "../icons";

@customElement("ui-icon")
export class UiIcon extends LitElement {
    @property({ type: String }) name?: IconName;
    @property({ type: Number }) size = 16;
    @property({ type: String }) color = "currentColor";

    static styles = css`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      vertical-align: middle;
    }
    svg {
      width: 100%;
      height: 100%;
      stroke: currentColor;
      fill: none;
      stroke-width: 1.5px;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `;

    render() {
        const iconTemplate = this.name ? icons[this.name] : undefined;
        if (!iconTemplate) return html``;

        return html`
      <style>
        :host {
          width: ${this.size}px;
          height: ${this.size}px;
          color: ${this.color};
        }
      </style>
      ${iconTemplate}
    `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "ui-icon": UiIcon;
    }
}
