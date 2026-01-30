/**
 * AssureBot - Storage Layer
 *
 * PostgreSQL for persistent data (tasks, profiles, traits)
 * Redis for caching and sessions
 */

import type { ScheduledTask } from "./scheduler.js";

export type StorageConfig = {
  postgres?: {
    url: string;
  };
  redis?: {
    url: string;
  };
};

export type Storage = {
  // Tasks
  saveTask: (task: ScheduledTask) => Promise<void>;
  getTask: (id: string) => Promise<ScheduledTask | null>;
  getAllTasks: () => Promise<ScheduledTask[]>;
  deleteTask: (id: string) => Promise<boolean>;

  // Conversations (Redis cache)
  getConversation: (userId: number) => Promise<ConversationMessage[]>;
  saveConversation: (userId: number, messages: ConversationMessage[]) => Promise<void>;
  clearConversation: (userId: number) => Promise<void>;

  // Personality (Redis + PostgreSQL)
  getUserProfile: (userId: number) => Promise<UserProfile | null>;
  saveUserProfile: (profile: UserProfile) => Promise<void>;
  getPersonalityTraits: () => Promise<PersonalityTraits | null>;
  savePersonalityTraits: (traits: PersonalityTraits) => Promise<void>;

  // Health
  isHealthy: () => Promise<boolean>;
  close: () => Promise<void>;
};

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
};

export type UserProfile = {
  userId: number;
  name?: string;
  timezone?: string;
  preferredTone: "casual" | "professional" | "friendly" | "concise";
  interests: string[];
  recentTopics: string[];
  interactionCount: number;
  lastSeen: Date;
  notes: string[];
};

export type PersonalityTraits = {
  name: string;
  greeting: string;
  signOff: string;
  humor: "none" | "subtle" | "playful";
  verbosity: "concise" | "balanced" | "detailed";
  commonPhrases: string[];
  avoidPhrases: string[];
  expertiseAreas: string[];
  lastUpdated: Date;
  version: number;
};

/**
 * In-memory storage (fallback when no DB configured)
 */
function createMemoryStorage(): Storage {
  const tasks = new Map<string, ScheduledTask>();
  const conversations = new Map<number, ConversationMessage[]>();
  const userProfiles = new Map<number, UserProfile>();
  let personalityTraits: PersonalityTraits | null = null;

  return {
    async saveTask(task) {
      tasks.set(task.id, task);
    },
    async getTask(id) {
      return tasks.get(id) || null;
    },
    async getAllTasks() {
      return Array.from(tasks.values());
    },
    async deleteTask(id) {
      return tasks.delete(id);
    },
    async getConversation(userId) {
      return conversations.get(userId) || [];
    },
    async saveConversation(userId, messages) {
      conversations.set(userId, messages);
    },
    async clearConversation(userId) {
      conversations.delete(userId);
    },
    async getUserProfile(userId) {
      return userProfiles.get(userId) || null;
    },
    async saveUserProfile(profile) {
      userProfiles.set(profile.userId, profile);
    },
    async getPersonalityTraits() {
      return personalityTraits;
    },
    async savePersonalityTraits(traits) {
      personalityTraits = traits;
    },
    async isHealthy() {
      return true;
    },
    async close() {
      // Nothing to close
    },
  };
}

/**
 * PostgreSQL storage for tasks and personality
 */
async function createPostgresStorage(url: string): Promise<{
  saveTask: Storage["saveTask"];
  getTask: Storage["getTask"];
  getAllTasks: Storage["getAllTasks"];
  deleteTask: Storage["deleteTask"];
  getUserProfile: Storage["getUserProfile"];
  saveUserProfile: Storage["saveUserProfile"];
  getPersonalityTraits: Storage["getPersonalityTraits"];
  savePersonalityTraits: Storage["savePersonalityTraits"];
  isHealthy: () => Promise<boolean>;
  close: () => Promise<void>;
}> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: url });

  // Create tables if not exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      schedule TEXT NOT NULL,
      prompt TEXT NOT NULL,
      enabled BOOLEAN DEFAULT true,
      last_run TIMESTAMPTZ,
      last_status TEXT,
      last_error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // User profiles table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id BIGINT PRIMARY KEY,
      name TEXT,
      timezone TEXT,
      preferred_tone TEXT DEFAULT 'friendly',
      interests JSONB DEFAULT '[]',
      recent_topics JSONB DEFAULT '[]',
      interaction_count INTEGER DEFAULT 0,
      last_seen TIMESTAMPTZ DEFAULT NOW(),
      notes JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Personality traits table (singleton)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS personality_traits (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      name TEXT DEFAULT 'AssureBot',
      greeting TEXT DEFAULT 'Hey',
      sign_off TEXT DEFAULT '',
      humor TEXT DEFAULT 'subtle',
      verbosity TEXT DEFAULT 'balanced',
      common_phrases JSONB DEFAULT '[]',
      avoid_phrases JSONB DEFAULT '[]',
      expertise_areas JSONB DEFAULT '["coding", "analysis", "automation"]',
      last_updated TIMESTAMPTZ DEFAULT NOW(),
      version INTEGER DEFAULT 1
    )
  `);

  console.log("[storage] PostgreSQL connected, tables ready");

  return {
    async saveTask(task) {
      await pool.query(
        `INSERT INTO scheduled_tasks (id, name, schedule, prompt, enabled, last_run, last_status, last_error, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (id) DO UPDATE SET
           name = $2, schedule = $3, prompt = $4, enabled = $5,
           last_run = $6, last_status = $7, last_error = $8, updated_at = NOW()`,
        [
          task.id,
          task.name,
          task.schedule,
          task.prompt,
          task.enabled,
          task.lastRun || null,
          task.lastStatus || null,
          task.lastError || null,
        ]
      );
    },

    async getTask(id) {
      const result = await pool.query(
        "SELECT * FROM scheduled_tasks WHERE id = $1",
        [id]
      );
      if (result.rows.length === 0) return null;
      return rowToTask(result.rows[0]);
    },

    async getAllTasks() {
      const result = await pool.query("SELECT * FROM scheduled_tasks ORDER BY created_at");
      return result.rows.map(rowToTask);
    },

    async deleteTask(id) {
      const result = await pool.query(
        "DELETE FROM scheduled_tasks WHERE id = $1",
        [id]
      );
      return (result.rowCount ?? 0) > 0;
    },

    async getUserProfile(userId) {
      const result = await pool.query(
        "SELECT * FROM user_profiles WHERE user_id = $1",
        [userId]
      );
      if (result.rows.length === 0) return null;
      return rowToUserProfile(result.rows[0]);
    },

    async saveUserProfile(profile) {
      await pool.query(
        `INSERT INTO user_profiles (user_id, name, timezone, preferred_tone, interests, recent_topics, interaction_count, last_seen, notes, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           name = $2, timezone = $3, preferred_tone = $4, interests = $5,
           recent_topics = $6, interaction_count = $7, last_seen = $8, notes = $9, updated_at = NOW()`,
        [
          profile.userId,
          profile.name || null,
          profile.timezone || null,
          profile.preferredTone,
          JSON.stringify(profile.interests),
          JSON.stringify(profile.recentTopics),
          profile.interactionCount,
          profile.lastSeen,
          JSON.stringify(profile.notes),
        ]
      );
    },

    async getPersonalityTraits() {
      const result = await pool.query("SELECT * FROM personality_traits WHERE id = 1");
      if (result.rows.length === 0) return null;
      return rowToTraits(result.rows[0]);
    },

    async savePersonalityTraits(traits) {
      await pool.query(
        `INSERT INTO personality_traits (id, name, greeting, sign_off, humor, verbosity, common_phrases, avoid_phrases, expertise_areas, last_updated, version)
         VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           name = $1, greeting = $2, sign_off = $3, humor = $4, verbosity = $5,
           common_phrases = $6, avoid_phrases = $7, expertise_areas = $8, last_updated = $9, version = $10`,
        [
          traits.name,
          traits.greeting,
          traits.signOff,
          traits.humor,
          traits.verbosity,
          JSON.stringify(traits.commonPhrases),
          JSON.stringify(traits.avoidPhrases),
          JSON.stringify(traits.expertiseAreas),
          traits.lastUpdated,
          traits.version,
        ]
      );
    },

    async isHealthy() {
      try {
        await pool.query("SELECT 1");
        return true;
      } catch {
        return false;
      }
    },

    async close() {
      await pool.end();
    },
  };
}

function rowToTask(row: Record<string, unknown>): ScheduledTask {
  return {
    id: row.id as string,
    name: row.name as string,
    schedule: row.schedule as string,
    prompt: row.prompt as string,
    enabled: row.enabled as boolean,
    lastRun: row.last_run ? new Date(row.last_run as string) : undefined,
    lastStatus: row.last_status as "ok" | "error" | undefined,
    lastError: row.last_error as string | undefined,
  };
}

function rowToUserProfile(row: Record<string, unknown>): UserProfile {
  return {
    userId: Number(row.user_id),
    name: row.name as string | undefined,
    timezone: row.timezone as string | undefined,
    preferredTone: row.preferred_tone as UserProfile["preferredTone"],
    interests: (row.interests as string[]) || [],
    recentTopics: (row.recent_topics as string[]) || [],
    interactionCount: row.interaction_count as number,
    lastSeen: new Date(row.last_seen as string),
    notes: (row.notes as string[]) || [],
  };
}

function rowToTraits(row: Record<string, unknown>): PersonalityTraits {
  return {
    name: row.name as string,
    greeting: row.greeting as string,
    signOff: row.sign_off as string,
    humor: row.humor as PersonalityTraits["humor"],
    verbosity: row.verbosity as PersonalityTraits["verbosity"],
    commonPhrases: (row.common_phrases as string[]) || [],
    avoidPhrases: (row.avoid_phrases as string[]) || [],
    expertiseAreas: (row.expertise_areas as string[]) || [],
    lastUpdated: new Date(row.last_updated as string),
    version: row.version as number,
  };
}

/**
 * Redis storage for conversations/cache and personality caching
 */
async function createRedisStorage(url: string): Promise<{
  getConversation: Storage["getConversation"];
  saveConversation: Storage["saveConversation"];
  clearConversation: Storage["clearConversation"];
  getUserProfile: Storage["getUserProfile"];
  saveUserProfile: Storage["saveUserProfile"];
  getPersonalityTraits: Storage["getPersonalityTraits"];
  savePersonalityTraits: Storage["savePersonalityTraits"];
  isHealthy: () => Promise<boolean>;
  close: () => Promise<void>;
}> {
  const { createClient } = await import("redis");
  const client = createClient({ url });

  client.on("error", (err) => console.error("[redis] Error:", err));
  await client.connect();

  console.log("[storage] Redis connected");

  const CONVERSATION_TTL = 60 * 60 * 24; // 24 hours
  const PROFILE_TTL = 60 * 60 * 24 * 7; // 7 days
  const TRAITS_TTL = 60 * 60 * 24 * 30; // 30 days
  const MAX_MESSAGES = 50;

  return {
    async getConversation(userId) {
      const key = `conv:${userId}`;
      const data = await client.get(key);
      if (!data) return [];
      try {
        return JSON.parse(data) as ConversationMessage[];
      } catch {
        return [];
      }
    },

    async saveConversation(userId, messages) {
      const key = `conv:${userId}`;
      // Keep only last N messages
      const trimmed = messages.slice(-MAX_MESSAGES);
      await client.setEx(key, CONVERSATION_TTL, JSON.stringify(trimmed));
    },

    async clearConversation(userId) {
      const key = `conv:${userId}`;
      await client.del(key);
    },

    async getUserProfile(userId) {
      const key = `profile:${userId}`;
      const data = await client.get(key);
      if (!data) return null;
      try {
        const parsed = JSON.parse(data);
        return {
          ...parsed,
          lastSeen: new Date(parsed.lastSeen),
        } as UserProfile;
      } catch {
        return null;
      }
    },

    async saveUserProfile(profile) {
      const key = `profile:${profile.userId}`;
      await client.setEx(key, PROFILE_TTL, JSON.stringify(profile));
    },

    async getPersonalityTraits() {
      const key = "personality:traits";
      const data = await client.get(key);
      if (!data) return null;
      try {
        const parsed = JSON.parse(data);
        return {
          ...parsed,
          lastUpdated: new Date(parsed.lastUpdated),
        } as PersonalityTraits;
      } catch {
        return null;
      }
    },

    async savePersonalityTraits(traits) {
      const key = "personality:traits";
      await client.setEx(key, TRAITS_TTL, JSON.stringify(traits));
    },

    async isHealthy() {
      try {
        await client.ping();
        return true;
      } catch {
        return false;
      }
    },

    async close() {
      await client.quit();
    },
  };
}

/**
 * Create storage based on config
 * Strategy:
 * - Redis: fast cache for conversations, profiles, traits
 * - PostgreSQL: durable backing store for profiles, traits, tasks
 * - Memory: fallback when neither is available
 */
export async function createStorage(config: StorageConfig): Promise<Storage> {
  const memory = createMemoryStorage();

  let pgStorage: Awaited<ReturnType<typeof createPostgresStorage>> | null = null;
  let redisStorage: Awaited<ReturnType<typeof createRedisStorage>> | null = null;

  // Try PostgreSQL
  if (config.postgres?.url) {
    try {
      pgStorage = await createPostgresStorage(config.postgres.url);
    } catch (err) {
      console.error("[storage] PostgreSQL connection failed, using memory:", err);
    }
  }

  // Try Redis
  if (config.redis?.url) {
    try {
      redisStorage = await createRedisStorage(config.redis.url);
    } catch (err) {
      console.error("[storage] Redis connection failed, using memory:", err);
    }
  }

  // Create layered personality storage (Redis cache -> PostgreSQL backing -> memory fallback)
  async function getUserProfile(userId: number): Promise<UserProfile | null> {
    // Try Redis cache first
    if (redisStorage) {
      const cached = await redisStorage.getUserProfile(userId);
      if (cached) return cached;
    }
    // Try PostgreSQL
    if (pgStorage) {
      const profile = await pgStorage.getUserProfile(userId);
      // Cache in Redis if found
      if (profile && redisStorage) {
        await redisStorage.saveUserProfile(profile);
      }
      return profile;
    }
    // Fallback to memory
    return memory.getUserProfile(userId);
  }

  async function saveUserProfile(profile: UserProfile): Promise<void> {
    // Save to PostgreSQL (durable)
    if (pgStorage) {
      await pgStorage.saveUserProfile(profile);
    }
    // Cache in Redis
    if (redisStorage) {
      await redisStorage.saveUserProfile(profile);
    }
    // Also update memory for consistency
    await memory.saveUserProfile(profile);
  }

  async function getPersonalityTraits(): Promise<PersonalityTraits | null> {
    // Try Redis cache first
    if (redisStorage) {
      const cached = await redisStorage.getPersonalityTraits();
      if (cached) return cached;
    }
    // Try PostgreSQL
    if (pgStorage) {
      const traits = await pgStorage.getPersonalityTraits();
      // Cache in Redis if found
      if (traits && redisStorage) {
        await redisStorage.savePersonalityTraits(traits);
      }
      return traits;
    }
    // Fallback to memory
    return memory.getPersonalityTraits();
  }

  async function savePersonalityTraits(traits: PersonalityTraits): Promise<void> {
    // Save to PostgreSQL (durable)
    if (pgStorage) {
      await pgStorage.savePersonalityTraits(traits);
    }
    // Cache in Redis
    if (redisStorage) {
      await redisStorage.savePersonalityTraits(traits);
    }
    // Also update memory for consistency
    await memory.savePersonalityTraits(traits);
  }

  return {
    // Tasks: prefer PostgreSQL, fallback to memory
    saveTask: pgStorage?.saveTask ?? memory.saveTask,
    getTask: pgStorage?.getTask ?? memory.getTask,
    getAllTasks: pgStorage?.getAllTasks ?? memory.getAllTasks,
    deleteTask: pgStorage?.deleteTask ?? memory.deleteTask,

    // Conversations: prefer Redis, fallback to memory
    getConversation: redisStorage?.getConversation ?? memory.getConversation,
    saveConversation: redisStorage?.saveConversation ?? memory.saveConversation,
    clearConversation: redisStorage?.clearConversation ?? memory.clearConversation,

    // Personality: layered (Redis cache -> PostgreSQL -> memory)
    getUserProfile,
    saveUserProfile,
    getPersonalityTraits,
    savePersonalityTraits,

    async isHealthy() {
      const pgOk = pgStorage ? await pgStorage.isHealthy() : true;
      const redisOk = redisStorage ? await redisStorage.isHealthy() : true;
      return pgOk && redisOk;
    },

    async close() {
      await pgStorage?.close();
      await redisStorage?.close();
    },
  };
}
