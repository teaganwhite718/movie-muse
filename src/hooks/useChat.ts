import { useState, useCallback, useRef } from "react";
import type { ChatMessage, MovieSource } from "@/lib/types";
import { streamChatMessage } from "@/lib/chat-api";
import { toast } from "sonner";

const MAX_MEMORY = 10; // Last 10 exchanges

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (input: string) => {
      if (!input.trim() || isLoading) return;

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: input.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      const abortController = new AbortController();
      abortRef.current = abortController;

      // Build history for API (last N messages)
      const allMessages = [...messages, userMsg];
      const historyForApi = allMessages.slice(-MAX_MEMORY).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      let assistantContent = "";
      let sources: MovieSource[] = [];
      const assistantId = crypto.randomUUID();

      await streamChatMessage(
        historyForApi,
        {
          onDelta(text) {
            assistantContent += text;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.id === assistantId) {
                return prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: assistantContent }
                    : m
                );
              }
              return [
                ...prev,
                {
                  id: assistantId,
                  role: "assistant" as const,
                  content: assistantContent,
                  sources,
                  timestamp: new Date(),
                },
              ];
            });
          },
          onSources(s) {
            sources = s;
            // Update existing assistant message if it exists
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.id === assistantId) {
                return prev.map((m) =>
                  m.id === assistantId ? { ...m, sources: s } : m
                );
              }
              return prev;
            });
          },
          onDone() {
            // Ensure final message has sources
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, sources } : m
              )
            );
            setIsLoading(false);
          },
          onError(error) {
            toast.error(error);
            setIsLoading(false);
          },
        },
        abortController.signal
      );
    },
    [messages, isLoading]
  );

  const clearChat = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setIsLoading(false);
  }, []);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
  }, []);

  return {
    messages,
    isLoading,
    sendMessage,
    clearChat,
    stopGeneration,
  };
}
