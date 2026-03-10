import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TMDB_BASE = "https://api.themoviedb.org/3";
const MAX_CHUNK_CHARS = 1500;
const MIN_CHUNK_CHARS = 200;

interface MovieDetail {
  id: number;
  title: string;
  release_date: string;
  overview: string;
  genres: { name: string }[];
  runtime: number;
  vote_average: number;
  vote_count: number;
  tagline: string;
  budget: number;
  revenue: number;
  credits?: {
    crew: { job: string; name: string }[];
    cast: { name: string; character: string }[];
  };
}

/**
 * Fetch a TMDB page of popular/top-rated movies
 */
async function fetchMoviePage(
  tmdbKey: string,
  endpoint: string,
  page: number
): Promise<number[]> {
  const resp = await fetch(
    `${TMDB_BASE}${endpoint}?language=en-US&page=${page}`,
    {
      headers: {
        Authorization: `Bearer ${tmdbKey}`,
        accept: "application/json",
      },
    }
  );
  if (!resp.ok) {
    // Fallback to api_key param
    const resp2 = await fetch(
      `${TMDB_BASE}${endpoint}?api_key=${tmdbKey}&language=en-US&page=${page}`,
      { headers: { accept: "application/json" } }
    );
    if (!resp2.ok) return [];
    const data = await resp2.json();
    return (data.results || []).map((m: any) => m.id);
  }
  const data = await resp.json();
  return (data.results || []).map((m: any) => m.id);
}

/**
 * Fetch full movie details from TMDB
 */
async function fetchMovieDetail(
  tmdbId: number,
  tmdbKey: string
): Promise<MovieDetail | null> {
  let resp = await fetch(
    `${TMDB_BASE}/movie/${tmdbId}?append_to_response=credits&language=en-US`,
    {
      headers: {
        Authorization: `Bearer ${tmdbKey}`,
        accept: "application/json",
      },
    }
  );
  if (!resp.ok) {
    resp = await fetch(
      `${TMDB_BASE}/movie/${tmdbId}?api_key=${tmdbKey}&append_to_response=credits&language=en-US`,
      { headers: { accept: "application/json" } }
    );
  }
  if (!resp.ok) return null;
  return await resp.json();
}

/**
 * Build a rich text document from movie details
 */
function buildMovieDocument(detail: MovieDetail): string {
  const directors = (detail.credits?.crew || [])
    .filter((c) => c.job === "Director")
    .map((c) => c.name)
    .join(", ");

  const cast = (detail.credits?.cast || [])
    .slice(0, 10)
    .map((c) => `${c.name} as ${c.character}`)
    .join("; ");

  const genres = (detail.genres || []).map((g) => g.name).join(", ");

  const sections = [
    `MOVIE PROFILE`,
    `Title: ${detail.title}`,
    `Release Year: ${(detail.release_date || "").slice(0, 4)}`,
    `Director: ${directors || "Unknown"}`,
    `Genre: ${genres}`,
    `Runtime: ${detail.runtime || "N/A"} minutes`,
    `Rating: ${detail.vote_average}/10 (${detail.vote_count} votes)`,
    `Tagline: "${detail.tagline || ""}"`,
    ``,
    `PLOT OVERVIEW`,
    detail.overview || "No overview available.",
    ``,
    `CAST AND CREW`,
    `Director: ${directors || "Unknown"}`,
    `Main Cast: ${cast || "No cast info"}`,
    ``,
    `BOX OFFICE AND PRODUCTION`,
    detail.budget ? `Budget: $${detail.budget.toLocaleString()}` : "Budget: N/A",
    detail.revenue ? `Box Office Revenue: $${detail.revenue.toLocaleString()}` : "Box Office Revenue: N/A",
    ``,
    `CRITICAL RECEPTION`,
    `Average Rating: ${detail.vote_average}/10 based on ${detail.vote_count} votes`,
    detail.vote_average >= 8
      ? `This film is critically acclaimed with an excellent rating.`
      : detail.vote_average >= 6
        ? `This film received generally positive reviews.`
        : `This film received mixed or negative reviews.`,
  ];

  return sections.filter(Boolean).join("\n");
}

/**
 * Chunk a document into paragraphs
 */
function chunkDocument(
  text: string,
  movieTitle: string
): { text: string; section: string }[] {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
  const chunks: { text: string; section: string }[] = [];
  let current = "";
  let section = "General";

  const sectionPattern = /^[A-Z][A-Z\s]{3,}$/;

  for (const para of paragraphs) {
    if (sectionPattern.test(para.trim()) && para.trim().length < 80) {
      section = para.trim().replace(/:$/, "");
      continue;
    }

    if (current && current.length + para.length > MAX_CHUNK_CHARS) {
      chunks.push({ text: current.trim(), section });
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }

  if (current.trim().length >= MIN_CHUNK_CHARS) {
    chunks.push({ text: current.trim(), section });
  } else if (current.trim() && chunks.length > 0) {
    chunks[chunks.length - 1].text += "\n\n" + current.trim();
  } else if (current.trim()) {
    chunks.push({ text: current.trim(), section });
  }

  return chunks;
}

/**
 * Generate embeddings using Lovable AI gateway
 */
async function generateEmbedding(
  text: string,
  apiKey: string
): Promise<number[] | null> {
  try {
    // Use the chat completions endpoint to generate a pseudo-embedding
    // by asking the model to represent the text as a vector description
    // Actually, let's try the embeddings endpoint first
    const resp = await fetch(
      "https://ai.gateway.lovable.dev/v1/embeddings",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: text.slice(0, 8000), // Limit input length
          model: "text-embedding-3-small",
          dimensions: 768,
        }),
      }
    );

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TMDB_API_KEY = Deno.env.get("TMDB_API_KEY");
    if (!TMDB_API_KEY) throw new Error("TMDB_API_KEY not configured");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({}));
    const targetCount = body.count || 55;

    // Check existing count
    const { count: existingCount } = await supabase
      .from("movie_documents")
      .select("*", { count: "exact", head: true });

    if ((existingCount || 0) >= targetCount) {
      return new Response(
        JSON.stringify({
          message: `Already have ${existingCount} movies in the database`,
          documents: existingCount,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get existing TMDB IDs to avoid duplicates
    const { data: existingDocs } = await supabase
      .from("movie_documents")
      .select("tmdb_id");
    const existingIds = new Set((existingDocs || []).map((d: any) => d.tmdb_id));

    // Collect unique movie IDs from multiple TMDB endpoints
    const movieIds = new Set<number>();
    const endpoints = [
      "/movie/popular",
      "/movie/top_rated",
      "/movie/now_playing",
    ];

    for (const endpoint of endpoints) {
      for (let page = 1; page <= 5; page++) {
        const ids = await fetchMoviePage(TMDB_API_KEY, endpoint, page);
        ids.forEach((id) => {
          if (!existingIds.has(id)) movieIds.add(id);
        });
        if (movieIds.size + (existingCount || 0) >= targetCount + 10) break;
      }
      if (movieIds.size + (existingCount || 0) >= targetCount + 10) break;
    }

    console.log(`Found ${movieIds.size} new movie IDs to process`);

    let processed = 0;
    let failed = 0;
    const needed = targetCount - (existingCount || 0);

    for (const tmdbId of movieIds) {
      if (processed >= needed) break;

      try {
        // Fetch details
        const detail = await fetchMovieDetail(tmdbId, TMDB_API_KEY);
        if (!detail || !detail.overview) {
          failed++;
          continue;
        }

        const directors = (detail.credits?.crew || [])
          .filter((c) => c.job === "Director")
          .map((c) => c.name)
          .join(", ");
        const genres = (detail.genres || []).map((g) => g.name).join(", ");
        const fullText = buildMovieDocument(detail);

        // Insert document
        const { data: docData, error: docError } = await supabase
          .from("movie_documents")
          .insert({
            movie_title: detail.title,
            release_year: (detail.release_date || "").slice(0, 4) || "Unknown",
            genre: genres || "Unknown",
            director: directors || "Unknown",
            tmdb_id: detail.id,
            overview: detail.overview,
            full_text: fullText,
          })
          .select("id")
          .single();

        if (docError) {
          console.error(`Doc insert error for ${detail.title}:`, docError);
          failed++;
          continue;
        }

        // Chunk the document
        const chunks = chunkDocument(fullText, detail.title);

        // Generate embeddings and insert chunks
        for (let i = 0; i < chunks.length; i++) {
          const embedding = await generateEmbedding(
            chunks[i].text,
            LOVABLE_API_KEY
          );

          const { error: chunkError } = await supabase
            .from("movie_chunks")
            .insert({
              document_id: docData.id,
              chunk_index: i,
              section: chunks[i].section,
              text: chunks[i].text,
              embedding: embedding,
              movie_title: detail.title,
              release_year:
                (detail.release_date || "").slice(0, 4) || "Unknown",
              genre: genres || "Unknown",
              director: directors || "Unknown",
            });

          if (chunkError) {
            console.error(
              `Chunk insert error for ${detail.title} chunk ${i}:`,
              chunkError
            );
          }
        }

        processed++;
        console.log(
          `✅ ${processed}/${needed}: ${detail.title} (${chunks.length} chunks)`
        );

        // Small delay to avoid rate limits
        await new Promise((r) => setTimeout(r, 250));
      } catch (e) {
        console.error(`Error processing movie ${tmdbId}:`, e);
        failed++;
      }
    }

    // Get final count
    const { count: finalCount } = await supabase
      .from("movie_documents")
      .select("*", { count: "exact", head: true });

    const { count: chunkCount } = await supabase
      .from("movie_chunks")
      .select("*", { count: "exact", head: true });

    return new Response(
      JSON.stringify({
        message: `Seeded ${processed} movies (${failed} failed)`,
        documents: finalCount,
        chunks: chunkCount,
        new_movies: processed,
        failed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("seed-movies error:", e);
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
