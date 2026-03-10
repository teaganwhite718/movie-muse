# Memory: index.md
Updated: now

# CineBot — Movie RAG Chatbot

## Design System
- Theme: Cinematic dark with gold/amber accents
- Fonts: Space Grotesk (display), Inter (body)
- Primary: HSL 40 85% 55% (cinema gold)
- Background: HSL 225 25% 6% (deep navy-black)
- Custom tokens: cinema-gold, cinema-surface, cinema-glow

## Architecture
- Frontend: React + Vite + Tailwind + shadcn
- Backend: Lovable Cloud edge functions `chat-rag` + `seed-movies`
- RAG: Multi-Query Retrieval via pgvector DB + Postgres full-text search
- Vector DB: pgvector with 55+ movie documents, tsvector full-text search
- Python backend: Complete local pipeline in `movie-rag-chatbot/`

## Secrets
- TMDB_API_KEY: stored in Cloud secrets
- LOVABLE_API_KEY: auto-provisioned

## Key Files
- Edge function (chat): supabase/functions/chat-rag/index.ts
- Edge function (seed): supabase/functions/seed-movies/index.ts
- Chat hook: src/hooks/useChat.ts
- API layer: src/lib/chat-api.ts
- Types: src/lib/types.ts

## DB Tables
- movie_documents: 55+ movies with full text, metadata, TMDB IDs
- movie_chunks: chunked text with tsvector full-text search indexes
- Functions: search_movie_chunks (text search), match_movie_chunks (vector search)

## Notes
- AI gateway does NOT support embedding models (text-embedding-3-small fails)
- Using Postgres full-text search (tsvector + GIN index) for retrieval instead
- Seeded movies are mostly 2025-2026 releases from TMDB popular/top_rated
- Classics like The Avengers (2012) and xXx (2002) also included
