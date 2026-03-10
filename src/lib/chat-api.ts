import type { ChatMessage, MovieSource, AppStatus } from "./types";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-rag`;

interface StreamCallbacks {
  onDelta: (text: string) => void;
  onSources: (sources: MovieSource[]) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

/**
 * Stream a RAG chat response from the edge function.
 * Handles custom "sources" SSE event + standard OpenAI streaming.
 */
export async function streamChatMessage(
  messages: { role: string; content: string }[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal
) {
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}));
    const errorMsg =
      errorData.error ||
      (resp.status === 429
        ? "Rate limit exceeded. Please wait a moment."
        : resp.status === 402
          ? "AI usage limit reached."
          : "Failed to get response.");
    callbacks.onError(errorMsg);
    return;
  }

  if (!resp.body) {
    callbacks.onError("No response stream");
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") {
          callbacks.onDone();
          return;
        }

        try {
          const parsed = JSON.parse(jsonStr);

          // Custom sources event
          if (parsed.type === "sources") {
            callbacks.onSources(parsed.sources || []);
            continue;
          }

          // Standard chat completion delta
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) callbacks.onDelta(content);
        } catch {
          // Incomplete JSON, put back and wait
          buffer = line + "\n" + buffer;
          break;
        }
      }
    }

    // Flush remaining
    if (buffer.trim()) {
      for (let raw of buffer.split("\n")) {
        if (!raw) continue;
        if (raw.endsWith("\r")) raw = raw.slice(0, -1);
        if (!raw.startsWith("data: ")) continue;
        const jsonStr = raw.slice(6).trim();
        if (jsonStr === "[DONE]") continue;
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.type === "sources") {
            callbacks.onSources(parsed.sources || []);
          } else {
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) callbacks.onDelta(content);
          }
        } catch {
          /* ignore */
        }
      }
    }

    callbacks.onDone();
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    callbacks.onError((e as Error).message || "Stream error");
  }
}

/**
 * Check backend status.
 */
export async function checkStatus(): Promise<AppStatus> {
  try {
    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ action: "status" }),
    });

    if (!resp.ok) throw new Error("Status check failed");
    return await resp.json();
  } catch {
    return { status: "offline", tmdb_connected: false, ai_connected: false };
  }
}
