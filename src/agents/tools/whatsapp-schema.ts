import { Type } from "@sinclair/typebox";

export const WhatsAppToolSchema = Type.Union([
  Type.Object({
    action: Type.Literal("send"),
    to: Type.String({ description: "Phone number with country code (e.g., +18572646913)" }),
    message: Type.String({ description: "Text message to send" }),
    mediaUrl: Type.Optional(Type.String({ description: "Local file path or URL of media to attach" })),
    gifPlayback: Type.Optional(Type.Boolean({ description: "If true, video plays as GIF" })),
  }),
  Type.Object({
    action: Type.Literal("status"),
    description: Type.Optional(Type.Literal("Check WhatsApp connection status")),
  }),
]);
