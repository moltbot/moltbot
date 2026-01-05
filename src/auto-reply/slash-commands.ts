export type ChatSlashCommand = {
  command: string;
  description: string;
};

const CHAT_SLASH_COMMANDS: ChatSlashCommand[] = [
  { command: "help", description: "Show command help" },
  { command: "status", description: "Show current status" },
  { command: "new", description: "Start a new session" },
  { command: "reset", description: "Reset the conversation" },
  { command: "restart", description: "Restart the bot" },
  { command: "model", description: "List or change the model" },
  { command: "think", description: "Set thinking level" },
  { command: "verbose", description: "Toggle verbose mode" },
  { command: "elevated", description: "Toggle elevated access" },
  { command: "queue", description: "Configure queue behavior" },
  { command: "activation", description: "Set group activation" },
  { command: "send", description: "Set send policy" },
];

export function getChatSlashCommands(): ChatSlashCommand[] {
  return CHAT_SLASH_COMMANDS;
}
