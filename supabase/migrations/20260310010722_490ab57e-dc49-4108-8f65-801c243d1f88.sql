
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Movie documents table (one row per movie)
CREATE TABLE public.movie_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movie_title TEXT NOT NULL,
  release_year TEXT DEFAULT 'Unknown',
  genre TEXT DEFAULT 'Unknown',
  director TEXT DEFAULT 'Unknown',
  tmdb_id INTEGER UNIQUE,
  overview TEXT,
  full_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Movie chunks table with embeddings
CREATE TABLE public.movie_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES public.movie_documents(id) ON DELETE CASCADE NOT NULL,
  chunk_index INTEGER NOT NULL,
  section TEXT DEFAULT 'General',
  text TEXT NOT NULL,
  embedding vector(768),
  movie_title TEXT NOT NULL,
  release_year TEXT DEFAULT 'Unknown',
  genre TEXT DEFAULT 'Unknown',
  director TEXT DEFAULT 'Unknown',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for vector similarity search
CREATE INDEX movie_chunks_embedding_idx ON public.movie_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- RLS: public read access (no auth needed for a chatbot)
ALTER TABLE public.movie_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movie_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for movie_documents"
  ON public.movie_documents FOR SELECT
  USING (true);

CREATE POLICY "Public read access for movie_chunks"
  ON public.movie_chunks FOR SELECT
  USING (true);

-- Service role can insert (for seeding)
CREATE POLICY "Service role insert for movie_documents"
  ON public.movie_documents FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role insert for movie_chunks"
  ON public.movie_chunks FOR INSERT
  WITH CHECK (true);

-- Similarity search function
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
