import { memo } from "react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Film, User } from "lucide-react";
import type { ChatMessage as ChatMessageType } from "@/lib/types";
import { SourceCitations } from "./SourceCitations";

interface ChatMessageProps {
  message: ChatMessageType;
  isStreaming?: boolean;
}

export const ChatMessage = memo(function ChatMessage({
  message,
  isStreaming,
}: ChatMessageProps) {
  const isAssistant = message.role === "assistant";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex gap-3 px-4 py-4 ${isAssistant ? "bg-card/40" : ""}`}
    >
      {/* Avatar */}
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          isAssistant
            ? "bg-primary/15 text-primary"
            : "bg-secondary text-secondary-foreground"
        }`}
      >
        {isAssistant ? (
          <Film className="h-4 w-4" />
        ) : (
          <User className="h-4 w-4" />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <span className="text-xs font-medium text-muted-foreground mb-1 block">
          {isAssistant ? "CineBot" : "You"}
        </span>

        <div className="prose prose-sm prose-invert max-w-none text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-a:text-primary prose-code:text-primary/80 prose-code:bg-secondary prose-code:rounded prose-code:px-1">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
          {isStreaming && (
            <span className="inline-block h-4 w-1.5 animate-pulse-gold bg-primary ml-0.5 rounded-sm" />
          )}
        </div>

        {/* Source citations */}
        {isAssistant && message.sources && (
          <SourceCitations sources={message.sources} />
        )}
      </div>
    </motion.div>
  );
});
