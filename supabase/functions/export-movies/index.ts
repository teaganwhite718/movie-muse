import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("DB credentials missing");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get all documents
    const allDocs: any[] = [];
    let page = 0;
    const pageSize = 100;
    
    while (true) {
      const { data, error } = await supabase
        .from("movie_documents")
        .select("movie_title, release_year, genre, director, tmdb_id, overview, full_text")
        .order("movie_title")
        .range(page * pageSize, (page + 1) * pageSize - 1);
      
      if (error) throw error;
      if (!data || data.length === 0) break;
      allDocs.push(...data);
      if (data.length < pageSize) break;
      page++;
    }

    // Get all chunks
    const allChunks: any[] = [];
    page = 0;
    
    while (true) {
      const { data, error } = await supabase
        .from("movie_chunks")
        .select("movie_title, release_year, genre, director, section, text, chunk_index, document_id")
        .order("movie_title")
        .range(page * pageSize, (page + 1) * pageSize - 1);
      
      if (error) throw error;
      if (!data || data.length === 0) break;
      allChunks.push(...data);
      if (data.length < pageSize) break;
      page++;
    }

    return new Response(
      JSON.stringify({
        metadata: {
          total_documents: allDocs.length,
          total_chunks: allChunks.length,
          exported_at: new Date().toISOString(),
        },
        documents: allDocs,
        chunks: allChunks,
      }, null, 2),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Content-Disposition": "attachment; filename=movies_database.json",
        },
      }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
