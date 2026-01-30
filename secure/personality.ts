/**
 * AssureBot - Personality Engine
 *
 * Persistent, evolving AI personality that learns from conversations.
 * - Stores traits and preferences in Redis (fast access)
 * - Syncs to PostgreSQL (durability)
 * - Learns user preferences, tone, and topics over time
 */

import type { Storage, UserProfile, PersonalityTraits } from "./storage.js";

// Re-export types for convenience
export type { UserProfile, PersonalityTraits };

export type Personality = {
  getSystemPrompt: (userId: number) => Promise<string>;
  getUserProfile: (userId: number) => Promise<UserProfile>;
  updateUserProfile: (userId: number, updates: Partial<UserProfile>) => Promise<void>;
  learnFromConversation: (userId: number, userMessage: string, botResponse: string) => Promise<void>;
  getTraits: () => Promise<PersonalityTraits>;
  updateTraits: (updates: Partial<PersonalityTraits>) => Promise<void>;
};

const DEFAULT_TRAITS: PersonalityTraits = {
  name: "AssureBot",
  greeting: "Hey",
  signOff: "",
  humor: "subtle",
  verbosity: "balanced",
  commonPhrases: [],
  avoidPhrases: [],
  expertiseAreas: ["coding", "analysis", "automation"],
  lastUpdated: new Date(),
  version: 1,
};

const DEFAULT_USER_PROFILE: Omit<UserProfile, "userId"> = {
  preferredTone: "friendly",
  interests: [],
  recentTopics: [],
  interactionCount: 0,
  lastSeen: new Date(),
  notes: [],
};

export async function createPersonality(storage: Storage): Promise<Personality> {
  // Load or initialize traits from storage
  let traits: PersonalityTraits = await storage.getPersonalityTraits() ?? { ...DEFAULT_TRAITS };

  // Save default traits if none exist
  if (!(await storage.getPersonalityTraits())) {
    await storage.savePersonalityTraits(traits);
    console.log("[personality] Initialized default traits");
  }

  // In-memory cache for hot profiles (reduces Redis calls during conversation)
  const profileCache = new Map<number, UserProfile>();

  async function loadUserProfile(userId: number): Promise<UserProfile> {
    // Check in-memory cache first
    if (profileCache.has(userId)) {
      return profileCache.get(userId)!;
    }

    // Try loading from storage (Redis -> PostgreSQL -> memory)
    const stored = await storage.getUserProfile(userId);

    if (stored) {
      profileCache.set(userId, stored);
      return stored;
    }

    // Create new profile for this user
    const profile: UserProfile = {
      userId,
      ...DEFAULT_USER_PROFILE,
      lastSeen: new Date(),
    };

    // Persist new profile
    await storage.saveUserProfile(profile);
    profileCache.set(userId, profile);
    console.log(`[personality] Created new profile for user ${userId}`);

    return profile;
  }

  async function saveUserProfile(profile: UserProfile): Promise<void> {
    // Update cache
    profileCache.set(profile.userId, profile);
    // Persist to storage (Redis + PostgreSQL)
    await storage.saveUserProfile(profile);
  }

  return {
    async getSystemPrompt(userId: number): Promise<string> {
      const profile = await loadUserProfile(userId);

      let prompt = `You are ${traits.name}, a helpful AI assistant running as a Telegram bot.

## Personality
- Tone: ${profile.preferredTone}
- Verbosity: ${traits.verbosity}
- Humor: ${traits.humor === "none" ? "Stay professional" : traits.humor === "subtle" ? "Occasional light humor is fine" : "Be playful and fun"}

## Your Expertise
${traits.expertiseAreas.map(e => `- ${e}`).join("\n")}

## About This User
- Interactions: ${profile.interactionCount}
- Interests: ${profile.interests.length > 0 ? profile.interests.join(", ") : "Not yet known"}
- Recent topics: ${profile.recentTopics.length > 0 ? profile.recentTopics.slice(-3).join(", ") : "None yet"}
${profile.notes.length > 0 ? `- Notes: ${profile.notes.slice(-3).join("; ")}` : ""}

## Available Commands (you can tell users about these)
- /js <code> - Run JavaScript code
- /python <code> or /py <code> - Run Python code
- /ts <code> - Run TypeScript code
- /bash <code> or /sh <code> - Run shell commands
- /run <language> <code> - Run code in any supported language (python, javascript, typescript, bash, rust, go, c, cpp, java, ruby, php)
- /status - Check bot and sandbox status
- /clear - Clear conversation history
- /schedule "<cron>" "<name>" <prompt> - Schedule recurring AI tasks
- /tasks - List scheduled tasks
- /deltask <id> - Delete a task

When a user asks to run code, you can either:
1. Tell them to use the appropriate command (e.g., "Use /js console.log('hello')")
2. Just answer their question directly if they don't need to execute code

## Guidelines
- Be helpful, accurate, and security-conscious
- Never reveal API keys, tokens, or secrets
- Adapt to the user's communication style
- Remember context from this conversation
- When users want to run code, guide them to use the right command
${traits.commonPhrases.length > 0 ? `- Phrases you like: ${traits.commonPhrases.join(", ")}` : ""}
${traits.avoidPhrases.length > 0 ? `- Avoid saying: ${traits.avoidPhrases.join(", ")}` : ""}`;

      return prompt;
    },

    async getUserProfile(userId: number): Promise<UserProfile> {
      return loadUserProfile(userId);
    },

    async updateUserProfile(userId: number, updates: Partial<UserProfile>): Promise<void> {
      const profile = await loadUserProfile(userId);
      Object.assign(profile, updates);
      await saveUserProfile(profile);
    },

    async learnFromConversation(
      userId: number,
      userMessage: string,
      botResponse: string
    ): Promise<void> {
      const profile = await loadUserProfile(userId);

      // Update interaction count
      profile.interactionCount++;
      profile.lastSeen = new Date();

      // Extract topics (simple keyword extraction)
      const topics = extractTopics(userMessage);
      if (topics.length > 0) {
        // Add to recent topics, keep last 10
        profile.recentTopics = [...profile.recentTopics, ...topics].slice(-10);

        // Add unique topics to interests
        for (const topic of topics) {
          if (!profile.interests.includes(topic)) {
            profile.interests.push(topic);
            // Keep interests manageable
            if (profile.interests.length > 20) {
              profile.interests = profile.interests.slice(-20);
            }
          }
        }
      }

      // Detect user preferences from message style
      if (userMessage.length < 50 && !userMessage.includes("?")) {
        // User prefers concise communication
        profile.preferredTone = "concise";
      } else if (userMessage.includes("please") || userMessage.includes("thank")) {
        profile.preferredTone = "friendly";
      }

      await saveUserProfile(profile);
    },

    async getTraits(): Promise<PersonalityTraits> {
      return { ...traits };
    },

    async updateTraits(updates: Partial<PersonalityTraits>): Promise<void> {
      traits = {
        ...traits,
        ...updates,
        lastUpdated: new Date(),
        version: traits.version + 1,
      };
      // Persist to storage
      await storage.savePersonalityTraits(traits);
      console.log(`[personality] Updated traits (v${traits.version})`);
    },
  };
}

/**
 * Simple topic extraction from text
 */
function extractTopics(text: string): string[] {
  const topics: string[] = [];
  const lowerText = text.toLowerCase();

  // Tech topics
  const techKeywords = [
    "python", "javascript", "typescript", "rust", "go", "java",
    "docker", "kubernetes", "aws", "api", "database", "sql",
    "react", "vue", "node", "linux", "git", "ci/cd",
    "machine learning", "ai", "llm", "chatgpt", "claude",
  ];

  for (const keyword of techKeywords) {
    if (lowerText.includes(keyword)) {
      topics.push(keyword);
    }
  }

  // Task types
  if (lowerText.includes("debug") || lowerText.includes("fix") || lowerText.includes("error")) {
    topics.push("debugging");
  }
  if (lowerText.includes("write") || lowerText.includes("create") || lowerText.includes("build")) {
    topics.push("development");
  }
  if (lowerText.includes("explain") || lowerText.includes("how does") || lowerText.includes("what is")) {
    topics.push("learning");
  }

  return topics.slice(0, 3); // Max 3 topics per message
}

/**
 * Generate a personalized greeting
 */
export function generateGreeting(traits: PersonalityTraits, profile: UserProfile): string {
  const greetings = {
    casual: ["Hey!", "Hi there!", "What's up?"],
    professional: ["Hello.", "Good day.", "Greetings."],
    friendly: ["Hey there! 👋", "Hi! Good to see you!", "Hello friend!"],
    concise: ["Hi.", "Hey.", ""],
  };

  const options = greetings[profile.preferredTone];
  const greeting = options[Math.floor(Math.random() * options.length)];

  if (profile.interactionCount > 10 && profile.name) {
    return `${greeting} ${profile.name}!`;
  }

  return greeting;
}
