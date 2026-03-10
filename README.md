# Cinebot, RAG-Powered Expert Chatbot

## Project info

**URL**: https://reel-recall-bot.lovable.app/

# CineBot / Reel Recall Bot 🎬

A production-ready **movie-domain RAG chatbot** that answers film-related questions using retrieved source documents, conversation memory, and source citations.

**Live App:** [reel-recall-bot.lovable.app](https://reel-recall-bot.lovable.app/)  
**Repository:** [movie-muse](https://github.com/teaganwhite718/movie-muse)

---

## Overview

CineBot is a **Retrieval-Augmented Generation (RAG)** chatbot built for movie knowledge and comparison. Instead of relying only on a language model’s general knowledge, the system retrieves relevant movie information from a structured movie corpus and uses that context to generate grounded responses.

The chatbot can answer questions about:

- plot summaries
- cast and crew
- directors
- genres
- production details
- movie comparisons
- follow-up questions in multi-turn conversations

The system is designed to provide **citation-supported answers** and to say when there is **not enough source information** rather than hallucinating unsupported facts.

---

## Features

- **Movie-domain RAG chatbot**
- **Hybrid retrieval**
  - semantic vector search
  - keyword-based full-text search
- **Multi-query expansion** for improved retrieval
- **Conversation memory** using the last 10 messages
- **Source citations** displayed with answers
- **Streaming responses** for a smoother chat experience
- **Supabase-backed persistence**
- **Modern React frontend** with a cinematic UI

---

## Tech Stack

### Frontend
- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn-ui
- React Query
- React Markdown

### Backend / Data
- Supabase Edge Functions
- PostgreSQL
- pgvector
- OpenAI Embeddings
- Lovable AI Gateway

### Local Pipeline
- Python
- pdfplumber
- BeautifulSoup
- python-docx

---

## System Architecture

At a high level, the system follows this flow:

```text
User Query
   ↓
Multi-Query Expansion
   ↓
Hybrid Retrieval
   ├── Vector Similarity Search
   └── Full-Text Search
   ↓
Context Assembly
   ↓
LLM Response Generation
   ↓
Streamed Answer + Source Citations
