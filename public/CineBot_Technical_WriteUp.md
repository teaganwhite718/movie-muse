# CineBot: Movie RAG Chatbot — Technical Write-Up

## 1. Architecture Overview

CineBot is a production-ready Retrieval-Augmented Generation (RAG) chatbot for movie knowledge, deployed at [reel-recall-bot.lovable.app](https://reel-recall-bot.lovable.app). The system processes 505 movie documents through a multi-stage pipeline combining vector similarity search with full-text keyword search (hybrid retrieval).

### System Architecture

```
User Query → Multi-Query Expansion → Hybrid Retrieval → LLM Generation → Streamed Response
                    │                      │
                    ▼                      ▼
            Lovable AI Gateway     ┌──────────────────┐
            (query variations)     │  Supabase/pgvector │
                                   │  - Vector search   │
                                   │  - Full-text search │
                                   └──────────────────┘
```

**Frontend:** React + TypeScript + Vite + Tailwind CSS with a cinematic dark UI (Space Grotesk/Inter typography, gold accent palette). The chat interface supports streaming responses via Server-Sent Events (SSE), markdown rendering, and inline source citations with expandable detail cards.

**Backend (Edge Functions):**
- `chat-rag`: Core RAG pipeline — accepts conversation history, performs multi-query expansion, hybrid retrieval, context assembly, and streams the LLM response with source metadata.
- `seed-movies`: Batch ingestion from TMDB API — fetches movie details, generates structured documents (overview, cast, production sections), chunks them with metadata, and stores in PostgreSQL.
- `embed-chunks`: Backfill pipeline that generates OpenAI `text-embedding-3-small` embeddings (768 dimensions) for all chunks in parallel batches.
- `export-movies`: Exports the complete database (documents, chunks, embeddings) to a static JSON file for version control.

**Database (PostgreSQL + pgvector):**
- `movie_documents`: 505 full movie records with metadata (title, year, genre, director, TMDB ID, overview).
- `movie_chunks`: ~505 text chunks with vector embeddings (`vector(768)`), full-text search indexes (`tsvector`), and metadata columns. Each chunk is linked to its parent document.
- `match_movie_chunks`: RPC function performing cosine similarity search via pgvector's `<=>` operator.
- `search_movie_chunks`: RPC function performing PostgreSQL full-text search with `ts_rank` scoring.

### Document Processing & Chunking

Documents are sourced from the TMDB API and structured into semantic sections: **Overview**, **Cast & Crew**, and **Production Details**. Each section becomes a chunk, preserving natural content boundaries (semantic chunking strategy). Metadata (title, year, genre, director) is attached to every chunk for filtered retrieval and citation generation.

The local Python pipeline (`movie-rag-chatbot/`) additionally supports PDF, HTML, DOCX, and TXT extraction via `pdfplumber`, `BeautifulSoup`, and `python-docx`, with configurable fixed-size and sentence-based chunking in `chunker.py`.

### Embedding & Vector Storage

All 505 chunks are embedded using OpenAI's `text-embedding-3-small` model at 768 dimensions, stored persistently in PostgreSQL via the `pgvector` extension. The `embed-chunks` edge function processes chunks in parallel batches of 5, with automatic progress tracking and idempotent re-runs.

---

## 2. Advanced Feature: Hybrid Search + Multi-Query Retrieval

CineBot implements **two** advanced features working in concert:

### Multi-Query Expansion
Before retrieval, the user's query is sent to the Lovable AI Gateway, which generates 3 search variations capturing different semantic angles. For example, *"What is Inception about?"* yields: `["Inception plot overview", "Inception Christopher Nolan sci-fi", "Inception dream heist movie"]`. This dramatically improves recall for ambiguous or broad queries.

### Hybrid Retrieval (Semantic + Keyword)
Each query variation triggers **two parallel searches**:
1. **Vector similarity** (`match_movie_chunks`): Cosine similarity against the 768-dim embeddings, weighted 2× in the final score.
2. **Full-text search** (`search_movie_chunks`): PostgreSQL `ts_rank` over `tsvector` indexes, catching exact title/name matches that embeddings may miss.

Results are merged into a deduplicated map keyed by chunk ID, scored, sorted, and the top 8 chunks are selected as context. This hybrid approach ensures both semantic understanding and keyword precision.

### Conversation Memory
The frontend maintains a sliding window of the last 10 messages, sent with every request. The system prompt instructs the LLM to use conversation history for follow-up resolution. The local Python pipeline (`memory.py`) implements an equivalent `ConversationMemory` class with configurable exchange limits.

---

## 3. Challenges & Solutions

| Challenge | Solution |
|---|---|
| **Embedding cost at scale** | Batched parallel processing (5 concurrent) with progress tracking; idempotent re-runs skip already-embedded chunks |
| **Search precision vs. recall** | Hybrid retrieval — vector search catches semantic matches while full-text search catches exact names/titles that embedding similarity can miss |
| **Query ambiguity** | Multi-query expansion generates 3 variations, each searched independently, then merged with deduplication |
| **Streaming with metadata** | Source citations are sent as the first SSE event before the LLM stream begins, allowing the UI to render citations as the response streams in |
| **Rate limiting** | Graceful handling of 429/402 responses from the AI gateway with user-friendly error messages |
| **Data persistence** | Full database export to `movies_database.json` (with embeddings) committed to GitHub, enabling reproducible deployment |

---

## 4. Results

- **Dataset:** 505 movie documents, all with real vector embeddings (768-dim)
- **Retrieval:** Hybrid search across vector similarity + full-text search with multi-query expansion
- **Response quality:** Grounded answers with source citations (`[Source N: Movie Title]`); refusal when sources are insufficient
- **Deployment:** Live at [reel-recall-bot.lovable.app](https://reel-recall-bot.lovable.app) with streaming responses, cinematic UI, and mobile-responsive design
- **Latency:** Multi-query + hybrid retrieval completes in ~1-2 seconds; streaming begins immediately after retrieval

### Sample Interaction
> **User:** "Compare the themes of The Shawshank Redemption and 12 Angry Men"
>
> **CineBot:** Provides a structured comparison citing specific source chunks from both movies, with expandable citation cards showing the retrieved text, section, and similarity score.

---

**Repository:** GitHub (comprehensive README, Python local pipeline, edge functions, static data export)
**Tech Stack:** React, TypeScript, Vite, Tailwind CSS, PostgreSQL, pgvector, OpenAI Embeddings, Lovable Cloud
