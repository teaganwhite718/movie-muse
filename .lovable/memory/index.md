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
- RAG: Multi-Query + Postgres full-text search (tsvector)
- 505 movies in DB + static JSON at public/data/movies_database.json (GitHub)

## Edge Functions
- chat-rag: RAG pipeline with multi-query retrieval
- seed-movies: Batch TMDB fetcher with parallel processing
- export-movies: Exports DB to JSON

## Data
- 505 movie documents from TMDB (popular, top_rated, now_playing, genre discover)
- Static export: public/data/movies_database.json (synced to GitHub)
- AI gateway does NOT support embedding models — uses tsvector full-text search
