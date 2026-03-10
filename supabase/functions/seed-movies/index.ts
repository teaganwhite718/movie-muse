import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TMDB_BASE = "https://api.themoviedb.org/3";

async function tmdbFetch(path: string, tmdbKey: string): Promise<any> {
  let resp = await fetch(`${TMDB_BASE}${path}`, {
    headers: { Authorization: `Bearer ${tmdbKey}`, accept: "application/json" },
  });
  if (!resp.ok) {
    resp = await fetch(`${TMDB_BASE}${path}${path.includes("?") ? "&" : "?"}api_key=${tmdbKey}`, {
      headers: { accept: "application/json" },
    });
  }
  if (!resp.ok) return null;
  return resp.json();
}

function buildMovieDocument(detail: any): string {
  const directors = (detail.credits?.crew || [])
    .filter((c: any) => c.job === "Director").map((c: any) => c.name).join(", ");
  const cast = (detail.credits?.cast || [])
    .slice(0, 10).map((c: any) => `${c.name} as ${c.character}`).join("; ");
  const genres = (detail.genres || []).map((g: any) => g.name).join(", ");

  return [
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
    detail.vote_average >= 8 ? `This film is critically acclaimed.`
      : detail.vote_average >= 6 ? `This film received generally positive reviews.`
      : `This film received mixed or negative reviews.`,
  ].filter(Boolean).join("\n");
}

function chunkText(text: string): { text: string; section: string }[] {
  const MAX = 1500, MIN = 200;
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
  const chunks: { text: string; section: string }[] = [];
  let current = "", section = "General";

  for (const para of paragraphs) {
    if (/^[A-Z][A-Z\s]{3,}$/.test(para.trim()) && para.trim().length < 80) {
      section = para.trim(); continue;
    }
    if (current && current.length + para.length > MAX) {
      chunks.push({ text: current.trim(), section });
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current.trim().length >= MIN) chunks.push({ text: current.trim(), section });
  else if (current.trim() && chunks.length > 0) chunks[chunks.length - 1].text += "\n\n" + current.trim();
  else if (current.trim()) chunks.push({ text: current.trim(), section });
  return chunks;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TMDB_API_KEY = Deno.env.get("TMDB_API_KEY");
    if (!TMDB_API_KEY) throw new Error("TMDB_API_KEY not configured");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("DB credentials missing");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const targetCount = body.count || 500;
    const batchSize = body.batch || 10; // parallel fetch batch size

    // Get existing state
    const { count: existingCount } = await supabase
      .from("movie_documents").select("*", { count: "exact", head: true });
    
    if ((existingCount || 0) >= targetCount) {
      return new Response(JSON.stringify({
        message: `Already have ${existingCount} movies`,
        documents: existingCount,
        done: true,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: existingDocs } = await supabase.from("movie_documents").select("tmdb_id");
    const existingIds = new Set((existingDocs || []).map((d: any) => d.tmdb_id));

    // Collect movie IDs from multiple endpoints and pages
    const movieIds = new Set<number>();
    const endpoints = [
      "/movie/popular", "/movie/top_rated", "/movie/now_playing", "/movie/upcoming",
    ];

    for (const endpoint of endpoints) {
      for (let page = 1; page <= 15; page++) {
        const data = await tmdbFetch(`${endpoint}?language=en-US&page=${page}`, TMDB_API_KEY);
        if (!data?.results) break;
        for (const m of data.results) {
          if (!existingIds.has(m.id)) movieIds.add(m.id);
        }
        if (movieIds.size >= targetCount - (existingCount || 0) + 50) break;
      }
      if (movieIds.size >= targetCount - (existingCount || 0) + 50) break;
    }

    // Also fetch genre-specific lists for diversity
    if (movieIds.size < targetCount - (existingCount || 0)) {
      const genres = [28, 35, 18, 27, 878, 53, 10749, 16, 12, 80, 14, 36, 10402, 9648, 10752];
      for (const genreId of genres) {
        for (let page = 1; page <= 5; page++) {
          const data = await tmdbFetch(
            `/discover/movie?language=en-US&sort_by=vote_count.desc&vote_count.gte=100&with_genres=${genreId}&page=${page}`,
            TMDB_API_KEY
          );
          if (!data?.results) break;
          for (const m of data.results) {
            if (!existingIds.has(m.id)) movieIds.add(m.id);
          }
        }
        if (movieIds.size >= targetCount - (existingCount || 0) + 50) break;
      }
    }

    const needed = targetCount - (existingCount || 0);
    const idsToProcess = Array.from(movieIds).slice(0, needed);
    console.log(`Processing ${idsToProcess.length} movies (have ${existingCount}, target ${targetCount})`);

    let processed = 0, failed = 0;

    // Process in parallel batches
    for (let i = 0; i < idsToProcess.length; i += batchSize) {
      const batch = idsToProcess.slice(i, i + batchSize);
      
      const results = await Promise.allSettled(
        batch.map(async (tmdbId) => {
          const detail = await tmdbFetch(
            `/movie/${tmdbId}?append_to_response=credits&language=en-US`,
            TMDB_API_KEY
          );
          if (!detail || !detail.overview) return null;

          const directors = (detail.credits?.crew || [])
            .filter((c: any) => c.job === "Director").map((c: any) => c.name).join(", ");
          const genres = (detail.genres || []).map((g: any) => g.name).join(", ");
          const fullText = buildMovieDocument(detail);
          const chunks = chunkText(fullText);

          return { detail, directors, genres, fullText, chunks };
        })
      );

      for (const result of results) {
        if (result.status === "rejected" || !result.value) { failed++; continue; }
        const { detail, directors, genres, fullText, chunks } = result.value;

        try {
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
            .select("id").single();

          if (docError) { failed++; continue; }

          for (let ci = 0; ci < chunks.length; ci++) {
            await supabase.from("movie_chunks").insert({
              document_id: docData.id,
              chunk_index: ci,
              section: chunks[ci].section,
              text: chunks[ci].text,
              movie_title: detail.title,
              release_year: (detail.release_date || "").slice(0, 4) || "Unknown",
              genre: genres || "Unknown",
              director: directors || "Unknown",
            });
          }
          processed++;
        } catch { failed++; }
      }

      console.log(`Batch done: ${processed} processed, ${failed} failed (${i + batch.length}/${idsToProcess.length})`);
    }

    const { count: finalCount } = await supabase
      .from("movie_documents").select("*", { count: "exact", head: true });
    const { count: chunkCount } = await supabase
      .from("movie_chunks").select("*", { count: "exact", head: true });

    return new Response(JSON.stringify({
      message: `Seeded ${processed} new movies (${failed} failed)`,
      documents: finalCount,
      chunks: chunkCount,
      new_movies: processed,
      failed,
      done: (finalCount || 0) >= targetCount,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("seed-movies error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
