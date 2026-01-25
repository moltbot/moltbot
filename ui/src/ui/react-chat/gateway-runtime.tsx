/**
 * Gateway runtime adapter for assistant-ui.
 * Bridges the existing GatewayBrowserClient with assistant-ui's ExternalStoreRuntime.
 */

import { useMemo, useSyncExternalStore, useCallback } from "react";
import {
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { convertMessages, type RawMessage } from "./message-adapter";

/**
 * Props passed from the Lit app to the React chat.
 */
export type GatewayRuntimeProps = {
  /** Raw messages from the gateway */
  messages: unknown[];
  /** Tool messages (thinking/reasoning) */
  toolMessages: unknown[];
  /** Current streaming text */
  stream: string | null;
  /** Whether currently sending a message */
  sending: boolean;
  /** Whether there's an active run that can be aborted */
  canAbort: boolean;
  /** Whether connected to the gateway */
  connected: boolean;
  /** Whether to show thinking/reasoning messages */
  showThinking: boolean;
  /** Send a message */
  onSend: (text: string) => void;
  /** Abort the current run */
  onAbort: () => void;
  /** Open sidebar with content */
  onOpenSidebar?: (content: string) => void;
  /** Assistant identity */
  assistantName: string;
  assistantAvatar: string | null;
};

/**
 * Subscription store for external props.
 * Allows React to subscribe to changes from the Lit app.
 */
function createPropsStore(initialProps: GatewayRuntimeProps) {
  let currentProps = initialProps;
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => currentProps,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update: (nextProps: GatewayRuntimeProps) => {
      currentProps = nextProps;
      listeners.forEach((listener) => listener());
    },
  };
}

// Singleton store instance
let propsStore: ReturnType<typeof createPropsStore> | null = null;

/**
 * Update the props store with new values.
 * Called from the Lit app when state changes.
 */
export function updateGatewayRuntimeProps(props: GatewayRuntimeProps) {
  if (!propsStore) {
    propsStore = createPropsStore(props);
  } else {
    propsStore.update(props);
  }
}

/**
 * Hook to use the gateway runtime props.
 */
function useGatewayProps(): GatewayRuntimeProps | null {
  const store = propsStore;
  return useSyncExternalStore(
    store?.subscribe ?? (() => () => {}),
    store?.getSnapshot ?? (() => null),
  );
}

/**
 * Custom hook that creates an assistant-ui runtime from gateway props.
 */
export function useGatewayRuntime() {
  const props = useGatewayProps();

  // Convert messages to assistant-ui format
  const messages = useMemo(() => {
    if (!props) return [];

    const allMessages: unknown[] = [...props.messages];

    // Add tool messages if showing thinking
    if (props.showThinking && props.toolMessages.length > 0) {
      allMessages.push(...props.toolMessages);
    }

    return convertMessages(allMessages);
  }, [props?.messages, props?.toolMessages, props?.showThinking]);

  // Handle streaming state
  const isRunning = props?.sending || props?.stream !== null;

  // Create streaming message if active
  const messagesWithStream = useMemo(() => {
    if (!props?.stream) return messages;

    const streamMessage: ThreadMessageLike = {
      role: "assistant",
      content: [{ type: "text", text: props.stream }],
      id: "streaming",
      createdAt: new Date(),
    };

    return [...messages, streamMessage];
  }, [messages, props?.stream]);

  // Send handler
  const onNew = useCallback(
    async (message: { content: Array<{ type: string; text?: string }> }) => {
      if (!props?.onSend) return;

      const textParts = message.content.filter(
        (part): part is { type: "text"; text: string } =>
          part.type === "text" && typeof part.text === "string",
      );

      const text = textParts.map((part) => part.text).join("\n");
      if (text.trim()) {
        props.onSend(text);
      }
    },
    [props?.onSend],
  );

  // Cancel handler
  const onCancel = useCallback(() => {
    if (props?.canAbort && props?.onAbort) {
      props.onAbort();
    }
  }, [props?.canAbort, props?.onAbort]);

  // Create the runtime
  const runtime = useExternalStoreRuntime({
    messages: messagesWithStream,
    isRunning,
    onNew,
    onCancel: props?.canAbort ? onCancel : undefined,
  });

  return {
    runtime,
    props,
    isConnected: props?.connected ?? false,
  };
}
