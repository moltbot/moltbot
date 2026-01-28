
import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import "./icon";

export interface SelectOption {
    label: string;
    value: string;
}

@customElement("ui-select")
export class UiSelect extends LitElement {
    @property({ type: String }) label = "";
    @property({ type: String }) value = "";
    @property({ type: Array }) options: SelectOption[] = [];
    @property({ type: Boolean }) disabled = false;

    static styles = css`
    :host {
      display: block;
      width: 100%;
    }

    .wrapper {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .label {
      font-size: 13px;
      font-weight: 500;
      color: var(--muted-foreground, #A8A29D);
    }

    .select-container {
      position: relative;
      display: flex;
      align-items: center;
    }

    select {
      width: 100%;
      height: 36px;
      padding: 0 12px;
      padding-right: 36px;
      background: var(--input-bg, #1A1816);
      border: 1px solid var(--input-border, #3E3B38);
      border-radius: var(--radius-md, 6px);
      color: var(--foreground, #EDE9E6);
      font-family: inherit;
      font-size: 14px;
      outline: none;
      appearance: none;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    select:focus {
      border-color: var(--accent, #FF9F40);
      box-shadow: 0 0 0 2px var(--accent-subtle, rgba(255, 159, 64, 0.1));
    }

    select:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Light mode */
    :host-context([data-theme="light"]) select {
      background: white;
      color: var(--foreground);
    }

    :host-context([data-theme="light"]) select:focus {
      background: white;
    }

    .chevron {
      position: absolute;
      right: 12px;
      pointer-events: none;
      color: var(--muted-foreground, #A8A29D);
      display: flex;
      align-items: center;
    }
  `;

    handleChange(e: Event) {
        const target = e.target as HTMLSelectElement;
        this.value = target.value;
        this.dispatchEvent(new CustomEvent("change", {
            detail: { value: this.value },
            bubbles: true,
            composed: true
        }));
    }

    render() {
        return html`
      <div class="wrapper">
        ${this.label ? html`<label class="label">${this.label}</label>` : null}
        <div class="select-container">
          <select 
            .value=${this.value} 
            ?disabled=${this.disabled}
            @change=${this.handleChange}
          >
            ${this.options.map(opt => html`
              <option value=${opt.value} ?selected=${opt.value === this.value}>${opt.label}</option>
            `)}
          </select>
          <ui-icon class="chevron" name="chevronDown" .size=${16}></ui-icon>
        </div>
      </div>
    `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "ui-select": UiSelect;
    }
}
