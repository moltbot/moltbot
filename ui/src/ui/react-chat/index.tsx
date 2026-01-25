/**
 * React chat interface entry point.
 * Provides mount/unmount functions for integration with the Lit app.
 */

import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { ChatApp } from "./ChatApp";
import {
  updateGatewayRuntimeProps,
  type GatewayRuntimeProps,
} from "./gateway-runtime";

// Track the React root instance
let reactRoot: Root | null = null;
let mountedContainer: HTMLElement | null = null;

/**
 * Mount the React chat interface into a container element.
 * @param container The DOM element to mount into
 * @param initialProps Initial props from the Lit app
 */
export function mountReactChat(
  container: HTMLElement,
  initialProps: GatewayRuntimeProps,
): void {
  // Update props first
  updateGatewayRuntimeProps(initialProps);

  // If already mounted in the same container, just update props
  if (reactRoot && mountedContainer === container) {
    return;
  }

  // If mounted elsewhere, unmount first
  if (reactRoot) {
    unmountReactChat();
  }

  // Create and mount the React app
  reactRoot = createRoot(container);
  mountedContainer = container;
  reactRoot.render(
    <React.StrictMode>
      <ChatApp />
    </React.StrictMode>,
  );
}

/**
 * Update the React chat with new props.
 * @param props Updated props from the Lit app
 */
export function updateReactChat(props: GatewayRuntimeProps): void {
  updateGatewayRuntimeProps(props);
}

/**
 * Unmount the React chat interface.
 */
export function unmountReactChat(): void {
  if (reactRoot) {
    reactRoot.unmount();
    reactRoot = null;
    mountedContainer = null;
  }
}

/**
 * Check if React chat is currently mounted.
 */
export function isReactChatMounted(): boolean {
  return reactRoot !== null;
}

// Re-export types
export type { GatewayRuntimeProps } from "./gateway-runtime";
