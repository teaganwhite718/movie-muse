# Memory: index.md
Updated: now

# CineBot — Movie RAG Chatbot

## Design System
- Theme: Cinematic dark with gold/amber accents
- Fonts: Space Grotesk (display), Inter (body)
- Primary: HSL 40 85% 55% (cinema gold)
- Background: HSL 225 25% 6% (deep navy-black)

## Architecture
- Frontend: React + Vite + Tailwind + shadcn
- Backend: Lovable Cloud edge functions
- RAG: Multi-Query + Hybrid Search (vector similarity + full-text search)
- Embeddings: OpenAI text-embedding-3-small (768 dimensions) via OPENAI_API_KEY
- 505 movies in DB + static JSON at public/data/movies_database.json (GitHub)

## Edge Functions
- chat-rag: Hybrid RAG (vector + text search), multi-query, streaming LLM
- seed-movies: Batch TMDB fetcher with parallel processing
- embed-chunks: Backfill OpenAI embeddings on chunks
- export-movies: Export DB (with embeddings) to JSON

## Secrets
- TMDB_API_KEY, LOVABLE_API_KEY (auto), OPENAI_API_KEY

## Data
- 505 movie documents, all with real vector embeddings
- Static export with embeddings: public/data/movies_database.json (GitHub)
- pgvector + tsvector hybrid search
