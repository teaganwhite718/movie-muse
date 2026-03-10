import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface MovieSource {
  movie_title: string;
  release_year: string;
  genre: string;
  director: string;
  section: string;
  source: string;
  text: string;
}

/**
 * Generate embedding via OpenAI
 */
async function generateEmbedding(text: string, apiKey: string): Promise<number[] | null> {
  try {
    const resp = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: text.slice(0, 8000),
        model: "text-embedding-3-small",
        dimensions: 768,
      }),
    });
    if (!resp.ok) {
      console.error(`Embedding failed (${resp.status})`);
      return null;
    }
    const data = await resp.json();
    return data.data?.[0]?.embedding || null;
  } catch (e) {
    console.error("Embedding error:", e);
    return null;
  }
}

/**
 * Multi-Query: extract search variations
 */
async function extractSearchQueries(query: string, apiKey: string): Promise<string[]> {
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: `Generate 3 search query variations for a movie database. Each should capture different aspects. Output a JSON array of strings only.

Examples:
"What is Inception about?" → ["Inception plot overview", "Inception Christopher Nolan sci-fi", "Inception dream heist movie"]
"Compare The Godfather and Goodfellas" → ["The Godfather crime family", "Goodfellas gangster movie", "Godfather vs Goodfellas comparison"]`,
          },
          { role: "user", content: query },
        ],
        temperature: 0.3,
      }),
    });
    if (!resp.ok) return [query];
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || "[]";
    const match = content.match(/\[[\s\S]*\]/);
    if (match) {
      const terms: string[] = JSON.parse(match[0]);
      return terms.length > 0 ? terms : [query];
    }
  } catch (e) {
    console.error("Query extraction error:", e);
  }
  return [query];
}

/**
 * Retrieve chunks using both vector similarity AND text search (hybrid)
 */
async function retrieveChunks(
  queries: string[],
  openaiKey: string,
  supabase: any
): Promise<MovieSource[]> {
  const allResults: Map<string, { source: MovieSource; score: number }> = new Map();

  for (const q of queries) {
    // Vector search
    const embedding = await generateEmbedding(q, openaiKey);
    if (embedding) {
      const { data: vectorResults } = await supabase.rpc("match_movie_chunks", {
        query_embedding: embedding,
        match_threshold: 0.2,
        match_count: 5,
      });
      if (vectorResults) {
        for (const r of vectorResults) {
          const existing = allResults.get(r.id);
          const score = (r.similarity || 0) * 2; // weight vector higher
          if (!existing || existing.score < score) {
            allResults.set(r.id, {
              source: {
                movie_title: r.movie_title,
                release_year: r.release_year,
                genre: r.genre,
                director: r.director,
                section: r.section,
                source: `Vector DB (similarity: ${r.similarity?.toFixed(3)})`,
                text: r.text,
              },
              score,
            });
          }
        }
      }
    }

    // Text search (fallback / hybrid)
    const { data: textResults } = await supabase.rpc("search_movie_chunks", {
      search_query: q,
      match_count: 5,
    });
    if (textResults) {
      for (const r of textResults) {
        const existing = allResults.get(r.id);
        const score = r.rank || 0;
        if (!existing || existing.score < score) {
          allResults.set(r.id, {
            source: {
              movie_title: r.movie_title,
              release_year: r.release_year,
              genre: r.genre,
              director: r.director,
              section: r.section,
              source: `Text Search (rank: ${r.rank?.toFixed(3)})`,
              text: r.text,
            },
            score,
          });
        }
      }
    }
  }

  // Sort by score descending
  return Array.from(allResults.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((r) => r.source);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, action } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("DB credentials missing");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Status check
    if (action === "status") {
      const { count: docCount } = await supabase
        .from("movie_documents").select("*", { count: "exact", head: true });
      const { count: chunkCount } = await supabase
        .from("movie_chunks").select("*", { count: "exact", head: true });
      const { count: embeddedCount } = await supabase
        .from("movie_chunks").select("*", { count: "exact", head: true })
        .not("embedding", "is", null);

      return new Response(JSON.stringify({
        status: "ready",
        tmdb_connected: true,
        ai_connected: true,
        vector_db: {
          documents: docCount || 0,
          chunks: chunkCount || 0,
          embedded: embeddedCount || 0,
        },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "Messages array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userMessages = messages.filter((m: ChatMessage) => m.role === "user");
    const latestQuery = userMessages[userMessages.length - 1]?.content || "";

    // Step 1: Multi-Query
    console.log("Extracting search queries for:", latestQuery);
    const searchQueries = await extractSearchQueries(latestQuery, LOVABLE_API_KEY);
    console.log("Search queries:", searchQueries);

    // Step 2: Hybrid retrieval (vector + text search)
    console.log("Retrieving from vector database (hybrid)...");
    const sources = await retrieveChunks(searchQueries, OPENAI_API_KEY, supabase);
    console.log(`Retrieved ${sources.length} chunks`);

    // Step 3: Build context
    const contextBlock = sources.length
      ? sources.map((s, i) =>
          `[Source ${i + 1}: ${s.movie_title} (${s.release_year}) — ${s.section}]\n${s.text}`
        ).join("\n\n---\n\n")
      : "No relevant movie documents were retrieved for this query.";

    // Step 4: System prompt
    const systemPrompt = `You are CineBot, a movie knowledge assistant powered by Retrieval-Augmented Generation (RAG) with a vector database of 500+ movie documents.

INSTRUCTIONS:
- Answer questions about movies using ONLY the retrieved source context provided below.
- If the retrieved context does not contain enough information to answer, say: "I don't have enough information in my sources to answer that accurately."
- Do NOT hallucinate or make up facts not supported by the sources.
- Always cite which source you used, referencing the movie title and source number.
- Format citations like: [Source 1: Movie Title]
- Be concise, clear, and helpful.
- For comparisons, use information from multiple sources.
- For follow-up questions, use conversation history to understand context.

RETRIEVED CONTEXT:
${contextBlock}`;

    const recentMessages = messages.slice(-10);

    // Step 5: LLM stream
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "system", content: systemPrompt }, ...recentMessages],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error("AI gateway error");
    }

    const encoder = new TextEncoder();
    const sourcesEvent = `data: ${JSON.stringify({ type: "sources", sources })}\n\n`;

    const readable = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(sourcesEvent));
        const reader = response.body!.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    console.error("chat-rag error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
