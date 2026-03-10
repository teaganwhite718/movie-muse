import { useState } from "react";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { MovieSource } from "@/lib/types";

interface SourceCitationsProps {
  sources: MovieSource[];
}

export function SourceCitations({ sources }: SourceCitationsProps) {
  const [expanded, setExpanded] = useState(false);

  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs font-medium text-primary/80 hover:text-primary transition-colors"
      >
        <FileText className="h-3.5 w-3.5" />
        <span>
          {sources.length} source{sources.length !== 1 ? "s" : ""} retrieved
        </span>
        {expanded ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-2">
              {sources.map((src, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-primary/15 bg-primary/5 px-3 py-2.5"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/15 text-[10px] font-bold text-primary">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-xs font-semibold text-foreground">
                          {src.movie_title}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          ({src.release_year})
                        </span>
                        {src.director && src.director !== "Unknown" && (
                          <span className="text-[10px] text-muted-foreground">
                            Dir: {src.director}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {src.genre &&
                          src.genre.split(", ").map((g) => (
                            <span
                              key={g}
                              className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground"
                            >
                              {g}
                            </span>
                          ))}
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {src.section}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground line-clamp-3">
                        {src.text.slice(0, 300)}…
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
