import { motion } from "framer-motion";
import { Film, Sparkles } from "lucide-react";

const SUGGESTIONS = [
  "What is Inception about?",
  "Compare The Godfather and Goodfellas",
  "Who directed The Dark Knight?",
  "What themes does Parasite explore?",
  "Recommend a sci-fi movie",
  "What awards did Schindler's List win?",
];

interface EmptyStateProps {
  onSuggestionClick: (text: string) => void;
}

export function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center max-w-lg"
      >
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-secondary gold-glow">
          <Film className="h-10 w-10 text-primary" />
        </div>

        <h1 className="font-display text-3xl font-bold tracking-tight mb-2">
          CineBot
        </h1>
        <p className="text-muted-foreground text-base mb-8">
          Your AI movie knowledge assistant — powered by RAG.
          <br />
          Ask about plots, directors, awards, themes, and more.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SUGGESTIONS.map((s, i) => (
            <motion.button
              key={s}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 * i }}
              onClick={() => onSuggestionClick(s)}
              className="group flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-4 py-3 text-left text-sm text-secondary-foreground transition-all hover:border-primary/40 hover:bg-secondary"
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary opacity-60 group-hover:opacity-100 transition-opacity" />
              <span>{s}</span>
            </motion.button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
