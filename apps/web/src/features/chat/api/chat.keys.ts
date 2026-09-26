export const chatKeys = {
  all: ["chat"] as const,
  conversations: () => [...chatKeys.all, "conversations"] as const,
  messages: (conversationId: string) =>
    [...chatKeys.all, "messages", conversationId] as const,
  search: (query: string, conversationId?: string) =>
    [...chatKeys.all, "search", query, conversationId] as const,
};
