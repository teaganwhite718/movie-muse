
CREATE OR REPLACE FUNCTION public.match_movie_chunks(
  query_embedding vector(768),
  match_threshold FLOAT DEFAULT 0.3,
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
  similarity FLOAT
)
LANGUAGE sql STABLE
SET search_path = public, extensions
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
    1 - (mc.embedding <=> query_embedding) AS similarity
  FROM public.movie_chunks mc
  WHERE 1 - (mc.embedding <=> query_embedding) > match_threshold
  ORDER BY mc.embedding <=> query_embedding
  LIMIT match_count;
$$;
