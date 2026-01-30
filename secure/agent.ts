/**
 * AssureBot - Agent Core
 *
 * Minimal AI agent that handles conversations with image support.
 * Direct API calls to Anthropic or OpenAI - no intermediaries.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { SecureConfig } from "./config.js";
import type { AuditLogger } from "./audit.js";

export type ImageContent = {
  type: "image";
  data: string; // base64
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
};

export type TextContent = {
  type: "text";
  text: string;
};

export type MessageContent = string | (TextContent | ImageContent)[];

export type Message = {
  role: "user" | "assistant";
  content: MessageContent;
};

export type AgentResponse = {
  text: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
};

export type AgentCore = {
  chat: (messages: Message[], systemPrompt?: string) => Promise<AgentResponse>;
  analyzeImage: (imageData: string, mediaType: ImageContent["mediaType"], prompt?: string) => Promise<AgentResponse>;
  provider: "anthropic" | "openai" | "openrouter";
};

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_OPENAI_MODEL = "gpt-4o";
const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-3.5-sonnet";

const DEFAULT_SYSTEM_PROMPT = `You are AssureBot, a helpful AI assistant running as a secure Telegram bot.

You are direct, concise, and helpful. You can:
- Answer questions and have conversations
- Analyze images and documents shared with you
- Help with coding and technical tasks
- Summarize content and extract information

## Available Commands (tell users about these when relevant)
- /js <code> - Run JavaScript
- /python <code> - Run Python
- /ts <code> - Run TypeScript
- /bash <code> - Run shell commands
- /run <lang> <code> - Run code in any language (python, js, ts, bash, rust, go, c, cpp, java, ruby, php)
- /status - Check bot status
- /clear - Clear conversation history

When users ask to run or test code, guide them to use the appropriate command.
Example: "Use /js console.log('hello')" or "Try /python print('hello')"

Be security-conscious:
- Never reveal API keys, tokens, or secrets
- Don't execute commands that could harm the system
- Warn users about potentially dangerous operations`;

function createAnthropicAgent(config: SecureConfig, audit: AuditLogger): AgentCore {
  const client = new Anthropic({
    apiKey: config.ai.apiKey,
  });

  const model = config.ai.model || DEFAULT_ANTHROPIC_MODEL;

  function convertContent(content: MessageContent): Anthropic.MessageParam["content"] {
    if (typeof content === "string") {
      return content;
    }
    return content.map((part) => {
      if (part.type === "text") {
        return { type: "text" as const, text: part.text };
      }
      return {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: part.mediaType,
          data: part.data,
        },
      };
    });
  }

  return {
    provider: "anthropic",

    async chat(messages: Message[], systemPrompt?: string): Promise<AgentResponse> {
      try {
        const response = await client.messages.create({
          model,
          max_tokens: 4096,
          system: systemPrompt || DEFAULT_SYSTEM_PROMPT,
          messages: messages.map((m) => ({
            role: m.role,
            content: convertContent(m.content),
          })),
        });

        const text = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("\n");

        return {
          text,
          usage: {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
          },
        };
      } catch (err) {
        audit.error({
          error: `Anthropic API error: ${err instanceof Error ? err.message : String(err)}`,
        });
        throw err;
      }
    },

    async analyzeImage(
      imageData: string,
      mediaType: ImageContent["mediaType"],
      prompt = "What's in this image? Describe it in detail."
    ): Promise<AgentResponse> {
      const messages: Message[] = [
        {
          role: "user",
          content: [
            { type: "image", data: imageData, mediaType },
            { type: "text", text: prompt },
          ],
        },
      ];
      return this.chat(messages);
    },
  };
}

function createOpenAIAgent(config: SecureConfig, audit: AuditLogger): AgentCore {
  const client = new OpenAI({
    apiKey: config.ai.apiKey,
  });

  const model = config.ai.model || DEFAULT_OPENAI_MODEL;

  type OpenAIContent = OpenAI.ChatCompletionContentPart[];

  function convertContent(content: MessageContent): string | OpenAIContent {
    if (typeof content === "string") {
      return content;
    }
    return content.map((part) => {
      if (part.type === "text") {
        return { type: "text" as const, text: part.text };
      }
      return {
        type: "image_url" as const,
        image_url: {
          url: `data:${part.mediaType};base64,${part.data}`,
        },
      };
    });
  }

  return {
    provider: "openai",

    async chat(messages: Message[], systemPrompt?: string): Promise<AgentResponse> {
      try {
        const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
          { role: "system", content: systemPrompt || DEFAULT_SYSTEM_PROMPT },
        ];

        for (const m of messages) {
          if (m.role === "user") {
            openaiMessages.push({
              role: "user",
              content: convertContent(m.content),
            });
          } else {
            // Assistant messages are always text
            openaiMessages.push({
              role: "assistant",
              content: typeof m.content === "string" ? m.content : "",
            });
          }
        }

        const response = await client.chat.completions.create({
          model,
          max_tokens: 4096,
          messages: openaiMessages,
        });

        const text = response.choices[0]?.message?.content || "";

        return {
          text,
          usage: response.usage
            ? {
                inputTokens: response.usage.prompt_tokens,
                outputTokens: response.usage.completion_tokens,
              }
            : undefined,
        };
      } catch (err) {
        audit.error({
          error: `OpenAI API error: ${err instanceof Error ? err.message : String(err)}`,
        });
        throw err;
      }
    },

    async analyzeImage(
      imageData: string,
      mediaType: ImageContent["mediaType"],
      prompt = "What's in this image? Describe it in detail."
    ): Promise<AgentResponse> {
      const messages: Message[] = [
        {
          role: "user",
          content: [
            { type: "image", data: imageData, mediaType },
            { type: "text", text: prompt },
          ],
        },
      ];
      return this.chat(messages);
    },
  };
}

function createOpenRouterAgent(config: SecureConfig, audit: AuditLogger): AgentCore {
  // OpenRouter uses OpenAI-compatible API
  const client = new OpenAI({
    apiKey: config.ai.apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://github.com/TNovs1/moltbot",
      "X-Title": "AssureBot",
    },
  });

  const model = config.ai.model || DEFAULT_OPENROUTER_MODEL;

  type OpenAIContent = OpenAI.ChatCompletionContentPart[];

  function convertContent(content: MessageContent): string | OpenAIContent {
    if (typeof content === "string") {
      return content;
    }
    return content.map((part) => {
      if (part.type === "text") {
        return { type: "text" as const, text: part.text };
      }
      return {
        type: "image_url" as const,
        image_url: {
          url: `data:${part.mediaType};base64,${part.data}`,
        },
      };
    });
  }

  return {
    provider: "openrouter",

    async chat(messages: Message[], systemPrompt?: string): Promise<AgentResponse> {
      try {
        const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
          { role: "system", content: systemPrompt || DEFAULT_SYSTEM_PROMPT },
        ];

        for (const m of messages) {
          if (m.role === "user") {
            openaiMessages.push({
              role: "user",
              content: convertContent(m.content),
            });
          } else {
            openaiMessages.push({
              role: "assistant",
              content: typeof m.content === "string" ? m.content : "",
            });
          }
        }

        const response = await client.chat.completions.create({
          model,
          max_tokens: 4096,
          messages: openaiMessages,
        });

        const text = response.choices[0]?.message?.content || "";

        return {
          text,
          usage: response.usage
            ? {
                inputTokens: response.usage.prompt_tokens,
                outputTokens: response.usage.completion_tokens,
              }
            : undefined,
        };
      } catch (err) {
        audit.error({
          error: `OpenRouter API error: ${err instanceof Error ? err.message : String(err)}`,
        });
        throw err;
      }
    },

    async analyzeImage(
      imageData: string,
      mediaType: ImageContent["mediaType"],
      prompt = "What's in this image? Describe it in detail."
    ): Promise<AgentResponse> {
      const messages: Message[] = [
        {
          role: "user",
          content: [
            { type: "image", data: imageData, mediaType },
            { type: "text", text: prompt },
          ],
        },
      ];
      return this.chat(messages);
    },
  };
}

export function createAgent(config: SecureConfig, audit: AuditLogger): AgentCore {
  if (config.ai.provider === "anthropic") {
    return createAnthropicAgent(config, audit);
  }
  if (config.ai.provider === "openrouter") {
    return createOpenRouterAgent(config, audit);
  }
  return createOpenAIAgent(config, audit);
}

/**
 * Simple in-memory conversation store
 * For Railway, consider using Redis or persistent storage
 */
export type ConversationStore = {
  get: (userId: number) => Message[];
  add: (userId: number, message: Message) => void;
  clear: (userId: number) => void;
};

const MAX_HISTORY = 20;

export function createConversationStore(): ConversationStore {
  const conversations = new Map<number, Message[]>();

  return {
    get(userId: number): Message[] {
      return conversations.get(userId) || [];
    },

    add(userId: number, message: Message): void {
      const history = conversations.get(userId) || [];
      history.push(message);
      // Keep only last N messages
      if (history.length > MAX_HISTORY) {
        history.splice(0, history.length - MAX_HISTORY);
      }
      conversations.set(userId, history);
    },

    clear(userId: number): void {
      conversations.delete(userId);
    },
  };
}
