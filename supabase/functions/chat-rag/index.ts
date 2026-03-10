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
 * Generate embedding for a query using Lovable AI gateway
 */
async function generateEmbedding(
  text: string,
  apiKey: string
): Promise<number[] | null> {
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
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
      console.error(`Embedding failed (${resp.status}):`, await resp.text());
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
 * Multi-Query: extract search variations from the user query
 */
async function extractSearchQueries(
  query: string,
  apiKey: string
): Promise<string[]> {
  try {
    const resp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: `Generate 3 search query variations for a movie database. Each variation should capture different aspects of the user's question. Output a JSON array of strings, nothing else.

Examples:
"What is Inception about?" → ["Inception plot overview", "Inception Christopher Nolan sci-fi", "Inception dream heist movie"]
"Compare The Godfather and Goodfellas" → ["The Godfather crime family", "Goodfellas gangster movie", "Godfather vs Goodfellas comparison"]
"Best horror movies" → ["top rated horror films", "scary movies critically acclaimed", "horror genre best rated"]`,
            },
            { role: "user", content: query },
          ],
          temperature: 0.3,
        }),
      }
    );

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
 * Retrieve chunks from pgvector using embedding similarity
 */
async function retrieveChunks(
  queries: string[],
  apiKey: string,
  supabase: any
): Promise<MovieSource[]> {
  const allResults: any[] = [];

  for (const q of queries) {
    const embedding = await generateEmbedding(q, apiKey);
    if (!embedding) continue;

    const { data, error } = await supabase.rpc("match_movie_chunks", {
      query_embedding: embedding,
      match_threshold: 0.2,
      match_count: 5,
    });

    if (error) {
      console.error("Vector search error:", error);
      continue;
    }
    if (data) allResults.push(...data);
  }

  // Deduplicate by chunk id
  const seen = new Set<string>();
  const unique: MovieSource[] = [];
  for (const r of allResults) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    unique.push({
      movie_title: r.movie_title,
      release_year: r.release_year,
      genre: r.genre,
      director: r.director,
      section: r.section,
      source: `Vector DB (similarity: ${r.similarity?.toFixed(3)})`,
      text: r.text,
    });
  }

  // Sort by similarity (highest first) and return top results
  return unique.slice(0, 8);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, action } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY)
      throw new Error("LOVABLE_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Health/status check
    if (action === "status") {
      const { count: docCount } = await supabase
        .from("movie_documents")
        .select("*", { count: "exact", head: true });

      const { count: chunkCount } = await supabase
        .from("movie_chunks")
        .select("*", { count: "exact", head: true });

      return new Response(
        JSON.stringify({
          status: "ready",
          tmdb_connected: true,
          ai_connected: true,
          vector_db: {
            documents: docCount || 0,
            chunks: chunkCount || 0,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "Messages array is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get the latest user message for retrieval
    const userMessages = messages.filter(
      (m: ChatMessage) => m.role === "user"
    );
    const latestQuery = userMessages[userMessages.length - 1]?.content || "";

    // Step 1: Multi-Query — generate search variations
    console.log("Generating query variations for:", latestQuery);
    const searchQueries = await extractSearchQueries(latestQuery, LOVABLE_API_KEY);
    console.log("Search queries:", searchQueries);

    // Step 2: Retrieve from vector database
    console.log("Retrieving from vector database...");
    const sources = await retrieveChunks(searchQueries, LOVABLE_API_KEY, supabase);
    console.log(`Retrieved ${sources.length} chunks from vector DB`);

    // Step 3: Build context from retrieved chunks
    const contextBlock = sources.length
      ? sources
          .map(
            (s, i) =>
              `[Source ${i + 1}: ${s.movie_title} (${s.release_year}) — ${s.section}]\n${s.text}`
          )
          .join("\n\n---\n\n")
      : "No relevant movie documents were retrieved for this query.";

    // Step 4: Build final prompt
    const systemPrompt = `You are CineBot, a movie knowledge assistant powered by Retrieval-Augmented Generation (RAG) with a vector database of 50+ movie documents.

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

    // Step 5: Call LLM with streaming
    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: systemPrompt },
            ...recentMessages,
          ],
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI usage limit reached. Please add credits." }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error("AI gateway returned an error");
    }

    // Stream response with sources metadata prepended
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
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    console.error("chat-rag error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
