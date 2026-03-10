import { useRef, useEffect } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { EmptyState } from "./EmptyState";
import type { ChatMessage as ChatMessageType } from "@/lib/types";

interface ChatContainerProps {
  messages: ChatMessageType[];
  isLoading: boolean;
  onSend: (message: string) => void;
  onStop: () => void;
}

export function ChatContainer({
  messages,
  isLoading,
  onSend,
  onStop,
}: ChatContainerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  return (
    <div className="flex h-full flex-col">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
        {messages.length === 0 ? (
          <EmptyState onSuggestionClick={onSend} />
        ) : (
          <div className="mx-auto max-w-3xl divide-y divide-border/50">
            {messages.map((msg, i) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                isStreaming={
                  isLoading &&
                  i === messages.length - 1 &&
                  msg.role === "assistant"
                }
              />
            ))}

            {/* Loading indicator when waiting for first token */}
            {isLoading &&
              messages[messages.length - 1]?.role === "user" && (
                <div className="flex gap-3 px-4 py-4 bg-card/40">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <div className="flex gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-gold" />
                      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-gold [animation-delay:0.3s]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-gold [animation-delay:0.6s]" />
                    </div>
                  </div>
                  <div className="flex items-center">
                    <span className="text-xs text-muted-foreground">
                      Searching movie knowledge base…
                    </span>
                  </div>
                </div>
              )}
          </div>
        )}
      </div>

      {/* Input */}
      <ChatInput onSend={onSend} isLoading={isLoading} onStop={onStop} />
    </div>
  );
}
