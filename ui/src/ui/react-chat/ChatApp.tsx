/**
 * React-based chat interface using assistant-ui.
 * This component integrates with the existing GatewayBrowserClient via the runtime adapter.
 */

import React from "react";
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ActionBarPrimitive,
} from "@assistant-ui/react";
import { useGatewayRuntime } from "./gateway-runtime";

/**
 * Custom welcome message when no messages exist.
 */
function WelcomeMessage() {
  return (
    <div className="aui-welcome">
      <h2>Welcome to Clawdbot</h2>
      <p>Send a message to start chatting with your AI assistant.</p>
    </div>
  );
}

/**
 * Disconnected state overlay.
 */
function DisconnectedOverlay() {
  return (
    <div className="aui-disconnected-overlay">
      <div className="aui-disconnected-content">
        <span className="aui-disconnected-icon">⚠</span>
        <span>Disconnected from gateway</span>
      </div>
    </div>
  );
}

/**
 * Custom composer with styling that matches the existing UI.
 */
function ChatComposer({ disabled }: { disabled?: boolean }) {
  return (
    <ComposerPrimitive.Root className="aui-composer">
      <ComposerPrimitive.Input
        placeholder={
          disabled
            ? "Connect to the gateway to start chatting…"
            : "Message (↩ to send, Shift+↩ for line breaks)"
        }
        disabled={disabled}
        className="aui-composer-input"
      />
      <ComposerPrimitive.Send className="aui-composer-send" disabled={disabled}>
        Send
      </ComposerPrimitive.Send>
    </ComposerPrimitive.Root>
  );
}

/**
 * User message component.
 */
function UserMessage() {
  return (
    <MessagePrimitive.Root className="aui-message" data-aui-role="user">
      <MessagePrimitive.Content className="aui-message-content" />
    </MessagePrimitive.Root>
  );
}

/**
 * Assistant message component with actions.
 */
function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="aui-message" data-aui-role="assistant">
      <MessagePrimitive.Content className="aui-message-content" />
      <ActionBarPrimitive.Root className="aui-action-bar">
        <ActionBarPrimitive.Copy className="aui-action-copy">
          Copy
        </ActionBarPrimitive.Copy>
      </ActionBarPrimitive.Root>
    </MessagePrimitive.Root>
  );
}

/**
 * System message component.
 */
function SystemMessage() {
  return (
    <MessagePrimitive.Root className="aui-message" data-aui-role="system">
      <MessagePrimitive.Content className="aui-message-content" />
    </MessagePrimitive.Root>
  );
}

/**
 * Main chat thread component.
 */
function ChatThread({ isConnected }: { isConnected: boolean }) {
  return (
    <div className="aui-thread-container">
      {!isConnected && <DisconnectedOverlay />}
      <ThreadPrimitive.Root className="aui-thread">
        <ThreadPrimitive.Viewport className="aui-thread-viewport">
          <ThreadPrimitive.Empty>
            <div className="aui-thread-welcome">
              <WelcomeMessage />
            </div>
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages
            components={{
              UserMessage,
              AssistantMessage,
              SystemMessage,
            }}
          />
          <ThreadPrimitive.ScrollToBottom className="aui-scroll-to-bottom">
            ↓ Scroll to bottom
          </ThreadPrimitive.ScrollToBottom>
        </ThreadPrimitive.Viewport>
        <ChatComposer disabled={!isConnected} />
      </ThreadPrimitive.Root>
    </div>
  );
}

/**
 * Main chat application component.
 * Wraps the thread with the runtime provider.
 */
export function ChatApp() {
  const { runtime, isConnected } = useGatewayRuntime();

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatThread isConnected={isConnected} />
    </AssistantRuntimeProvider>
  );
}

export default ChatApp;
