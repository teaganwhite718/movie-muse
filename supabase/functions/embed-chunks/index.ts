import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Generate embedding via OpenAI API
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
      const err = await resp.text();
      console.error(`Embedding failed (${resp.status}):`, err);
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
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("DB credentials missing");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({}));
    const batchSize = body.batch || 20;

    // Find chunks without embeddings
    const { data: chunks, error } = await supabase
      .from("movie_chunks")
      .select("id, text")
      .is("embedding", null)
      .limit(batchSize);

    if (error) throw error;
    if (!chunks || chunks.length === 0) {
      // Check total counts
      const { count: total } = await supabase
        .from("movie_chunks").select("*", { count: "exact", head: true });
      const { count: withEmbeddings } = await supabase
        .from("movie_chunks")
        .select("*", { count: "exact", head: true })
        .not("embedding", "is", null);

      return new Response(JSON.stringify({
        message: "All chunks have embeddings",
        total: total || 0,
        with_embeddings: withEmbeddings || 0,
        remaining: 0,
        done: true,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let processed = 0, failed = 0;

    // Process in parallel batches of 5
    for (let i = 0; i < chunks.length; i += 5) {
      const batch = chunks.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map(async (chunk) => {
          const embedding = await generateEmbedding(chunk.text, OPENAI_API_KEY);
          if (!embedding) throw new Error("No embedding");

          const { error: updateError } = await supabase
            .from("movie_chunks")
            .update({ embedding })
            .eq("id", chunk.id);

          if (updateError) throw updateError;
          return true;
        })
      );

      for (const r of results) {
        if (r.status === "fulfilled") processed++;
        else failed++;
      }
    }

    // Check remaining
    const { count: remaining } = await supabase
      .from("movie_chunks")
      .select("*", { count: "exact", head: true })
      .is("embedding", null);

    const { count: total } = await supabase
      .from("movie_chunks").select("*", { count: "exact", head: true });

    return new Response(JSON.stringify({
      message: `Embedded ${processed} chunks (${failed} failed)`,
      processed,
      failed,
      remaining: remaining || 0,
      total: total || 0,
      done: (remaining || 0) === 0,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("embed-chunks error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
