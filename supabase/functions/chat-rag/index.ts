import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TMDB_BASE = "https://api.themoviedb.org/3";

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
 * Multi-Query Retrieval: use LLM to extract movie titles and short search
 * keywords from the user question. TMDB search is title-based, so we need
 * clean, short search terms — not full sentences.
 */
async function extractSearchTerms(
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
              content:
                `You extract movie search terms from user questions. The search terms will be used with TMDB's movie search API which matches on movie titles.

Rules:
- Extract movie titles mentioned or implied in the question
- If no specific movie is mentioned, extract genre/theme keywords that could match movie titles
- Output 2-4 short search terms as a JSON array of strings
- Each term should be 1-3 words maximum — just titles or key terms
- Examples:
  "What is Inception about?" → ["Inception"]
  "Compare The Godfather and Goodfellas" → ["The Godfather", "Goodfellas"]
  "Recommend a sci-fi movie" → ["sci-fi", "science fiction", "space"]
  "Who directed The Dark Knight?" → ["The Dark Knight"]
  "What themes does Parasite explore?" → ["Parasite"]
  "Best horror movies" → ["horror", "scary", "thriller"]
Only output the JSON array, nothing else.`,
            },
            { role: "user", content: query },
          ],
          temperature: 0.3,
        }),
      }
    );

    if (!resp.ok) {
      console.error("Search term extraction failed:", resp.status);
      return [query];
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || "[]";
    const match = content.match(/\[[\s\S]*\]/);
    if (match) {
      const terms: string[] = JSON.parse(match[0]);
      console.log("Extracted search terms:", terms);
      return terms.length > 0 ? terms : [query];
    }
  } catch (e) {
    console.error("Error extracting search terms:", e);
  }
  return [query];
}

/**
 * Search TMDB for movies matching a query and fetch details.
 */
async function searchTMDB(
  query: string,
  tmdbKey: string
): Promise<MovieSource[]> {
  const sources: MovieSource[] = [];

  try {
    // Try Bearer token first (v4 Read Access Token), fallback to api_key param (v3)
    let searchResp = await fetch(
      `${TMDB_BASE}/search/movie?query=${encodeURIComponent(query)}&language=en-US&page=1`,
      {
        headers: {
          Authorization: `Bearer ${tmdbKey}`,
          accept: "application/json",
        },
      }
    );

    // If Bearer fails, try as v3 API key
    if (!searchResp.ok) {
      console.log(`Bearer auth failed (${searchResp.status}), trying api_key param...`);
      searchResp = await fetch(
        `${TMDB_BASE}/search/movie?api_key=${tmdbKey}&query=${encodeURIComponent(query)}&language=en-US&page=1`,
        { headers: { accept: "application/json" } }
      );
    }

    if (!searchResp.ok) {
      const errText = await searchResp.text();
      console.error(`TMDB search failed [${searchResp.status}]:`, errText);
      return sources;
    }
    const searchData = await searchResp.json();
    console.log(`TMDB search for "${query}" returned ${searchData.results?.length || 0} results`);
    const results = (searchData.results || []).slice(0, 3);

    for (const movie of results) {
      // Fetch full details
      try {
        let detailResp = await fetch(
          `${TMDB_BASE}/movie/${movie.id}?append_to_response=credits&language=en-US`,
          {
            headers: {
              Authorization: `Bearer ${tmdbKey}`,
              accept: "application/json",
            },
          }
        );

        if (!detailResp.ok) {
          detailResp = await fetch(
            `${TMDB_BASE}/movie/${movie.id}?api_key=${tmdbKey}&append_to_response=credits&language=en-US`,
            { headers: { accept: "application/json" } }
          );
        }

        if (!detailResp.ok) continue;
        const detail = await detailResp.json();

        const directors = (detail.credits?.crew || [])
          .filter((c: any) => c.job === "Director")
          .map((c: any) => c.name)
          .join(", ");

        const cast = (detail.credits?.cast || [])
          .slice(0, 5)
          .map((c: any) => `${c.name} as ${c.character}`)
          .join("; ");

        const genres = (detail.genres || [])
          .map((g: any) => g.name)
          .join(", ");

        const text = [
          `Title: ${detail.title}`,
          `Year: ${(detail.release_date || "").slice(0, 4)}`,
          `Director: ${directors || "Unknown"}`,
          `Genre: ${genres}`,
          `Runtime: ${detail.runtime || "N/A"} minutes`,
          `Rating: ${detail.vote_average}/10 (${detail.vote_count} votes)`,
          `Tagline: "${detail.tagline || ""}"`,
          ``,
          `Plot: ${detail.overview || "No overview available."}`,
          ``,
          `Cast: ${cast || "No cast info"}`,
          detail.budget
            ? `Budget: $${detail.budget.toLocaleString()}`
            : "",
          detail.revenue
            ? `Box Office: $${detail.revenue.toLocaleString()}`
            : "",
        ]
          .filter(Boolean)
          .join("\n");

        sources.push({
          movie_title: detail.title || "Unknown",
          release_year: (detail.release_date || "").slice(0, 4) || "Unknown",
          genre: genres || "Unknown",
          director: directors || "Unknown",
          section: "Full Profile",
          source: `TMDB ID: ${detail.id}`,
          text,
        });
      } catch {
        // Skip failed detail fetches
      }
    }
  } catch (e) {
    console.error("TMDB search error:", e);
  }

  return sources;
}

/**
 * Multi-Query Retrieval: search with all query variations,
 * merge and deduplicate by movie title.
 */
async function retrieveSources(
  queries: string[],
  tmdbKey: string
): Promise<MovieSource[]> {
  const allSources: MovieSource[] = [];

  for (const q of queries) {
    const results = await searchTMDB(q, tmdbKey);
    allSources.push(...results);
  }

  // Deduplicate by movie_title
  const seen = new Set<string>();
  const unique: MovieSource[] = [];
  for (const src of allSources) {
    const key = src.movie_title.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(src);
    }
  }

  return unique.slice(0, 6); // Return top 6 unique sources
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

    const TMDB_API_KEY = Deno.env.get("TMDB_API_KEY");
    if (!TMDB_API_KEY) throw new Error("TMDB_API_KEY is not configured");

    // Health/status check
    if (action === "status") {
      return new Response(
        JSON.stringify({
          status: "ready",
          tmdb_connected: true,
          ai_connected: true,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
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

    // Step 1: Multi-Query Retrieval — extract short search terms
    console.log("Extracting search terms for:", latestQuery);
    const searchTerms = await extractSearchTerms(
      latestQuery,
      LOVABLE_API_KEY
    );
    console.log("Search terms:", searchTerms);

    // Step 2: Retrieve sources from TMDB
    console.log("Retrieving sources from TMDB...");
    const sources = await retrieveSources(searchTerms, TMDB_API_KEY);
    console.log(`Retrieved ${sources.length} unique sources`);

    // Step 3: Build context from sources
    const contextBlock = sources.length
      ? sources
          .map(
            (s, i) =>
              `[Source ${i + 1}: ${s.movie_title} (${s.release_year}) — ${s.section}]\n${s.text}`
          )
          .join("\n\n---\n\n")
      : "No relevant movie documents were retrieved for this query.";

    // Step 4: Build final prompt with system instructions, context, and history
    const systemPrompt = `You are CineBot, a movie knowledge assistant powered by Retrieval-Augmented Generation (RAG).

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

    // Keep only last 10 messages for memory
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

    // We need to prepend the sources metadata before the stream
    // Send sources as a custom SSE event first, then stream the AI response
    const encoder = new TextEncoder();
    const sourcesEvent = `data: ${JSON.stringify({ type: "sources", sources })}\n\n`;

    const readable = new ReadableStream({
      async start(controller) {
        // Send sources metadata first
        controller.enqueue(encoder.encode(sourcesEvent));

        // Then pipe the AI stream through
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
