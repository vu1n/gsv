export const DEFAULT_CONVERSATION_ID = "default";
export const DEFAULT_CONVERSATION_GENERATION = 1;

export type ConversationStatus = "open" | "closed";

export type ProcessConversationRecord = {
  id: string;
  generation: number;
  status: ConversationStatus;
  title: string | null;
  createdAt: number;
  updatedAt: number;
};

export function normalizeConversationId(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : DEFAULT_CONVERSATION_ID;
}
