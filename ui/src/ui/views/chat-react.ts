/**
 * React chat view wrapper for Lit integration.
 * Mounts the React-based assistant-ui chat interface.
 */

import { html } from "lit";
import {
  mountReactChat,
  updateReactChat,
  unmountReactChat,
  type GatewayRuntimeProps,
} from "../react-chat/index";
import type { ChatProps } from "./chat";

// Store the current container element reference
let currentContainer: HTMLElement | null = null;
let isScheduled = false;

/**
 * Convert ChatProps to GatewayRuntimeProps for the React component.
 */
function toGatewayProps(props: ChatProps): GatewayRuntimeProps {
  return {
    messages: props.messages,
    toolMessages: props.toolMessages,
    stream: props.stream,
    sending: props.sending,
    canAbort: Boolean(props.canAbort),
    connected: props.connected,
    showThinking: props.showThinking,
    onSend: (text: string) => {
      // Update the draft and trigger send
      props.onDraftChange(text);
      props.onSend();
    },
    onAbort: () => {
      if (props.onAbort) {
        props.onAbort();
      }
    },
    onOpenSidebar: props.onOpenSidebar,
    assistantName: props.assistantName,
    assistantAvatar: props.assistantAvatar,
  };
}

/**
 * Schedule a React mount/update after the DOM is ready.
 */
function scheduleReactUpdate(props: ChatProps) {
  if (isScheduled) return;
  isScheduled = true;

  requestAnimationFrame(() => {
    isScheduled = false;
    const container = document.getElementById("react-chat-container");
    if (!container) return;

    const runtimeProps = toGatewayProps(props);

    if (currentContainer !== container) {
      // Mount or remount
      currentContainer = container;
      mountReactChat(container, runtimeProps);
    } else {
      // Just update props
      updateReactChat(runtimeProps);
    }
  });
}

/**
 * Cleanup when leaving the chat tab.
 */
export function cleanupReactChat() {
  if (currentContainer) {
    unmountReactChat();
    currentContainer = null;
  }
}

/**
 * Render the React chat interface container.
 * The actual React component is mounted after the DOM is ready.
 */
export function renderReactChat(props: ChatProps) {
  // Schedule React mount/update after render
  scheduleReactUpdate(props);

  // Render a container div that React will mount into
  return html`
    <section class="card chat chat--react">
      ${props.disabledReason
        ? html`<div class="callout">${props.disabledReason}</div>`
        : ""}
      ${props.error
        ? html`<div class="callout danger">${props.error}</div>`
        : ""}
      <div id="react-chat-container" class="react-chat-mount"></div>
    </section>
  `;
}
