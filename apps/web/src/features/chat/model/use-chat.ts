"use client";

import { useEffect } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { API_BASE_URL } from "@/lib/constants";
import { chatKeys } from "../api/chat.keys";
import {
  clearConversation,
  createDirectConversation,
  createGroupConversation,
  deleteMessage,
  forwardMessage,
  createPoll,
  votePoll,
  createEvent,
  respondEvent,
  editMessage,
  listConversations,
  listMessages,
  markConversationRead,
  searchMessages,
  sendMessage,
  setConversationMuted,
  setConversationPinned,
  setMessagePin,
  setMessageReaction,
  setMessageStar,
  uploadChatAttachment,
} from "../api/chat.api";

export function useConversations() {
  return useInfiniteQuery({
    queryKey: chatKeys.conversations(),
    queryFn: ({ pageParam }) => listConversations(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useMessages(conversationId: string | null) {
  return useInfiniteQuery({
    queryKey: chatKeys.messages(conversationId ?? ""),
    queryFn: ({ pageParam }) => listMessages(conversationId ?? "", pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(conversationId),
  });
}

export function useChatMutations(conversationId: string | null) {
  const client = useQueryClient();
  const invalidate = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: chatKeys.conversations() }),
      ...(conversationId
        ? [
            client.invalidateQueries({
              queryKey: chatKeys.messages(conversationId),
            }),
          ]
        : []),
    ]);
  };
  return {
    send: useMutation({
      mutationFn: (input: Parameters<typeof sendMessage>[1]) =>
        sendMessage(conversationId ?? "", input),
      onSuccess: invalidate,
    }),
    edit: useMutation({
      mutationFn: (input: {
        messageId: string;
        content: string;
        expectedUpdatedAt: string;
      }) =>
        editMessage(input.messageId, input.content, input.expectedUpdatedAt),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: deleteMessage, onSuccess: invalidate }),
    forward: useMutation({
      mutationFn: (input: { messageId: string; conversationIds: string[] }) => forwardMessage(input.messageId, input.conversationIds),
      onSuccess: invalidate,
    }),
    reaction: useMutation({
      mutationFn: (input: { messageId: string; emoji: string; reacted: boolean }) => setMessageReaction(input.messageId, input.emoji, input.reacted),
      onSuccess: invalidate,
    }),
    star: useMutation({
      mutationFn: ({
        messageId,
        starred,
      }: {
        messageId: string;
        starred: boolean;
      }) => setMessageStar(messageId, starred),
      onSuccess: invalidate,
    }),
    pinMessage: useMutation({
      mutationFn: ({
        messageId,
        pinned,
      }: {
        messageId: string;
        pinned: boolean;
      }) => setMessagePin(messageId, pinned),
      onSuccess: invalidate,
    }),
    read: useMutation({
      mutationFn: (messageId: string) =>
        markConversationRead(conversationId ?? "", messageId),
      onSuccess: () =>
        client.invalidateQueries({ queryKey: chatKeys.conversations() }),
    }),
    clear: useMutation({
      mutationFn: () => clearConversation(conversationId ?? ""),
      onSuccess: invalidate,
    }),
    pinConversation: useMutation({
      mutationFn: (pinned: boolean) =>
        setConversationPinned(conversationId ?? "", pinned),
      onSuccess: invalidate,
    }),
    mute: useMutation({
      mutationFn: (muted: boolean) =>
        setConversationMuted(conversationId ?? "", muted),
      onSuccess: invalidate,
    }),
    upload: useMutation({
      mutationFn: ({
        file,
        onProgress,
      }: {
        file: File;
        onProgress: (percent: number) => void;
      }) => uploadChatAttachment(file, onProgress),
    }),
    createPoll: useMutation({
      mutationFn: (input: { question: string; options: string[]; multiple: boolean; anonymous: boolean }) => createPoll(conversationId ?? "", input),
      onSuccess: invalidate,
    }),
    votePoll: useMutation({
      mutationFn: (input: { pollId: string; optionIds: string[] }) => votePoll(input.pollId, input.optionIds),
      onSuccess: invalidate,
    }),
    createEvent: useMutation({
      mutationFn: (input: { title: string; startsAt: string; endsAt: string; timezone: string }) => createEvent(conversationId ?? "", input),
      onSuccess: invalidate,
    }),
    respondEvent: useMutation({
      mutationFn: (input: { eventId: string; status: "GOING" | "MAYBE" | "DECLINED" }) => respondEvent(input.eventId, input.status),
      onSuccess: invalidate,
    }),
  };
}

export function useCreateConversation() {
  const client = useQueryClient();
  const done = () =>
    client.invalidateQueries({ queryKey: chatKeys.conversations() });
  return {
    direct: useMutation({
      mutationFn: createDirectConversation,
      onSuccess: done,
    }),
    group: useMutation({
      mutationFn: createGroupConversation,
      onSuccess: done,
    }),
  };
}

export function useChatSearch(query: string, conversationId?: string) {
  return useQuery({
    queryKey: chatKeys.search(query, conversationId),
    queryFn: () => searchMessages(query, conversationId),
    enabled: query.trim().length >= 2,
  });
}

export function useChatRealtime(): void {
  const client = useQueryClient();
  useEffect(() => {
    const refresh = () => {
      void client.invalidateQueries({ queryKey: chatKeys.all });
    };
    const wsUrl = new URL('/api/chat/ws', API_BASE_URL);
    wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let socket: WebSocket | undefined;
    const connect = () => {
      socket = new WebSocket(wsUrl);
      socket.onmessage = (event) => {
        if (typeof event.data !== 'string') return;
        try {
          const payload: unknown = JSON.parse(event.data);
          if (typeof payload === 'object' && payload !== null) refresh();
        } catch {
          // Ignore non-JSON frames; the connection remains usable.
        }
      };
      socket.onclose = () => {
        if (!stopped) retry = setTimeout(connect, 1_500);
      };
    };
    connect();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }, [client]);
}
