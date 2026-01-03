import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTelegramBot } from './bot.js';
import type { Message } from 'grammy';

// Mock web search modules
vi.mock('../web-search/executor.js', () => ({
  executeWebSearch: vi.fn(),
}));

vi.mock('../web-search/messages.js', () => ({
  messages: {
    acknowledgment: () => '🔍 Выполняю веб-поиск...',
    resultDelivery: (result: any) => `🌐 Результат поиска:\n\n${result.response}`,
    error: (error: string) => `❌ Ошибка поиска:\n\n${error}`,
  }
}));

// Mock deep research to avoid conflicts
vi.mock('../deep-research/index.js', () => ({
  parseDeepResearchCommand: vi.fn(() => null),
  executeDeepResearch: vi.fn(),
  normalizeDeepResearchTopic: vi.fn(),
  messages: {
    error: (msg: string) => `Deep research error: ${msg}`,
  },
  createExecuteButton: vi.fn(),
  createRetryButton: vi.fn(),
  parseCallbackData: vi.fn(),
  CALLBACK_PREFIX: 'dr_',
  CallbackActions: {},
  deliverResults: vi.fn(),
  truncateForTelegram: vi.fn((x: string) => x),
  generateGapQuestions: vi.fn(() => []),
}));

// Mock grammy
const useSpy = vi.fn();
const onSpy = vi.fn();
const stopSpy = vi.fn();
const sendChatActionSpy = vi.fn();
const sendMessageSpy = vi.fn(async () => ({ message_id: 77 }));
const editMessageTextSpy = vi.fn(async () => ({ message_id: 77 }));

vi.mock('grammy', () => ({
  Bot: class {
    api = {
      config: { use: useSpy },
      sendChatAction: sendChatActionSpy,
      sendMessage: sendMessageSpy,
      editMessageText: editMessageTextSpy,
    };
    on = onSpy;
    stop = stopSpy;
    handleUpdate: any;
    constructor(public token: string) {
      // @ts-ignore
      this.handleUpdate = async (update: any) => {
        // Find the message handler and call it
        const messageHandler = onSpy.mock.calls.find(call => call[0] === 'message')?.[1];
        if (messageHandler) {
          const mockCtx = {
            message: update.message,
            chat: update.message.chat,
            from: update.message.from,
            me: { username: 'testbot' },
            api: this.api,
            reply: (text: string) => this.api.sendMessage(update.message.chat.id, text),
          };
          await messageHandler(mockCtx);
        }
      };
    }
  },
  InputFile: class {},
  webhookCallback: vi.fn(),
}));

const throttlerSpy = vi.fn(() => 'throttler');

vi.mock('@grammyjs/transformer-throttler', () => ({
  apiThrottler: () => throttlerSpy(),
}));

import { executeWebSearch } from '../web-search/executor.js';

describe('Telegram Bot - Web Search Integration', () => {
  let bot: any;
  const mockToken = 'test-token';
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mock implementations
    vi.mocked(executeWebSearch).mockResolvedValue({
      success: true,
      result: {
        response: 'Test search result',
        session_id: 'test-123',
        stats: { models: {} }
      },
      stdout: '',
      stderr: ''
    });
    
    bot = createTelegramBot({
      token: mockToken,
      runtime: {
        log: console.log,
        error: console.error,
        exit: () => { throw new Error('exit'); }
      }
    });
  });
  
  function createMockMessage(text: string): Message.TextMessage {
    return {
      message_id: 1,
      date: Date.now(),
      chat: {
        id: 123,
        type: 'private',
      },
      from: {
        id: 456,
        is_bot: false,
        first_name: 'Test',
      },
      text: text,
    };
  }
  
  function createMessageUpdate(message: Message) {
    return {
      update_id: 1,
      message: message,
    };
  }
  
  it('triggers web search on /web command', async () => {
    const message = createMockMessage('/web погода в Москве');
    await bot.handleUpdate(createMessageUpdate(message));
    
    expect(executeWebSearch).toHaveBeenCalledWith('погода в Москве');
    
    // Verify acknowledgment was sent
    expect(bot.api.sendMessage).toHaveBeenCalledWith(
      123,
      '🔍 Выполняю веб-поиск...'
    );
    
    // Verify result was delivered
    expect(bot.api.editMessageText).toHaveBeenCalledWith(
      123,
      77,
      expect.stringContaining('🌐 Результат поиска:')
    );
  });
  
  it('handles search errors gracefully', async () => {
    vi.mocked(executeWebSearch).mockResolvedValue({
      success: false,
      error: 'CLI not found',
      runId: 'error-123',
      stdout: '',
      stderr: ''
    });
    
    const message = createMockMessage('/web тестовый запрос');
    await bot.handleUpdate(createMessageUpdate(message));
    
    expect(bot.api.editMessageText).toHaveBeenCalledWith(
      123,
      77,
      expect.stringContaining('❌ Ошибка поиска:')
    );
  });
  
  it('prevents duplicate searches for same chat', async () => {
    // Mock executeWebSearch to be slow
    let resolveSearch: (value: any) => void;
    const searchPromise = new Promise((resolve) => {
      resolveSearch = resolve;
    });
    vi.mocked(executeWebSearch).mockReturnValue(searchPromise);
    
    const message = createMockMessage('/web медленный запрос');
    const chatId = message.chat.id;
    
    // Start first search (don't await yet)
    const firstSearchPromise = bot.handleUpdate(createMessageUpdate(message));
    
    // Give it a moment to start
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Try to start second search before first completes
    await bot.handleUpdate(createMessageUpdate(message));
    
    // Second search should be blocked
    expect(bot.api.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('Поиск уже выполняется')
    );
    
    // Complete the first search
    resolveSearch!({
      success: true,
      result: {
        response: 'Result',
        session_id: 'test',
        stats: { models: {} }
      },
      stdout: '',
      stderr: ''
    });
    
    await firstSearchPromise;
  });
  
  it('handles missing query extraction', async () => {
    const message = createMockMessage('/web   ');
    await bot.handleUpdate(createMessageUpdate(message));
    
    // Should reply with missing query error
    expect(executeWebSearch).not.toHaveBeenCalled();
    expect(bot.api.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining('Please provide a search query after /web')
    );
  });
  
  it('works in group chats with mention', async () => {
    const groupMessage: Message.TextMessage = {
      message_id: 1,
      date: Date.now(),
      chat: {
        id: 789,
        type: 'group',
        title: 'Test Group',
      },
      from: {
        id: 456,
        is_bot: false,
        first_name: 'Test',
      },
      text: '/web@testbot погода в Москве',
    };
    
    await bot.handleUpdate(createMessageUpdate(groupMessage));
    
    expect(executeWebSearch).toHaveBeenCalled();
  });
});
