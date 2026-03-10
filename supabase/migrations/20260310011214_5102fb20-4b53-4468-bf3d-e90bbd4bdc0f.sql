
-- Add full-text search column to movie_chunks
ALTER TABLE public.movie_chunks ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (to_tsvector('english', text)) STORED;

-- Create GIN index for fast text search
CREATE INDEX IF NOT EXISTS movie_chunks_fts_idx ON public.movie_chunks USING gin(fts);

-- Also add text search on movie_title for direct title matching
ALTER TABLE public.movie_chunks ADD COLUMN IF NOT EXISTS title_fts tsvector
  GENERATED ALWAYS AS (to_tsvector('english', movie_title)) STORED;

CREATE INDEX IF NOT EXISTS movie_chunks_title_fts_idx ON public.movie_chunks USING gin(title_fts);

-- Create a text search function
CREATE OR REPLACE FUNCTION public.search_movie_chunks(
  search_query TEXT,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  chunk_index INTEGER,
  section TEXT,
  text TEXT,
  movie_title TEXT,
  release_year TEXT,
  genre TEXT,
  director TEXT,
  rank REAL
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT
    mc.id,
    mc.document_id,
    mc.chunk_index,
    mc.section,
    mc.text,
    mc.movie_title,
    mc.release_year,
    mc.genre,
    mc.director,
    ts_rank(mc.fts, websearch_to_tsquery('english', search_query)) +
    ts_rank(mc.title_fts, websearch_to_tsquery('english', search_query)) * 2.0 AS rank
  FROM public.movie_chunks mc
  WHERE mc.fts @@ websearch_to_tsquery('english', search_query)
     OR mc.title_fts @@ websearch_to_tsquery('english', search_query)
  ORDER BY rank DESC
  LIMIT match_count;
$$;
