import { html, nothing } from "lit";

import { formatPrimaryErrorMessage, getRecoveryInfo } from "../errors/recovery";

const DOCS_ROOT = "https://docs.openclaw.ai";

function renderDocsLinks(docs?: Array<{ label: string; path: string }>) {
  if (!docs || docs.length === 0) return nothing;
  return html`
    <div class="muted" style="margin-top: 6px;">
      Docs:
      ${docs.map(
        (doc, idx) =>
          html`${idx ? html`<span class="muted"> · </span>` : ""}
            <a
              class="session-link"
              href=${doc.path.startsWith("http") ? doc.path : `${DOCS_ROOT}${doc.path}`}
              target="_blank"
              rel="noreferrer"
              title=${`Docs: ${doc.label} (opens in new tab)`}
              >${doc.label}</a
            >`,
      )}
    </div>
  `;
}

export function renderErrorBody(error: string | null) {
  if (!error) return nothing;
  const info = getRecoveryInfo(error);
  const message = formatPrimaryErrorMessage(error);
  return html`
    <div><strong>${info?.title ?? "Error"}</strong></div>
    <div>${message}</div>
    ${info?.suggestions?.length
      ? html`
          <ul style="margin: 8px 0 0 18px;">
            ${info.suggestions.map((suggestion) => html`<li>${suggestion}</li>`)}
          </ul>
        `
      : nothing}
    ${renderDocsLinks(info?.docs)}
  `;
}

export function renderErrorCallout(
  error: string | null,
  opts?: { className?: string; style?: string },
) {
  if (!error) return nothing;
  const className = opts?.className ? `callout danger ${opts.className}` : "callout danger";
  return html`
    <div class=${className} style=${opts?.style ?? ""}>
      ${renderErrorBody(error)}
    </div>
  `;
}
