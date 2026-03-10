# 🎬 CineBot — Movie RAG Chatbot

A production-ready Retrieval-Augmented Generation (RAG) chatbot that answers questions about movies using a curated document collection, vector search, and OpenAI language models.

## Features

- **RAG Pipeline**: Retrieves relevant movie information from a vector database before generating answers
- **Multi-Query Retrieval**: Generates query variations for better recall
- **50+ Movie Documents**: Pre-built dataset covering classic and modern films
- **Paragraph-Based Chunking**: Semantically coherent document chunks with metadata
- **Persistent Vector Store**: ChromaDB with local persistent storage
- **Conversation Memory**: Tracks last 8 exchanges for multi-turn conversations
- **Source Citations**: Every answer includes clear source references
- **Document Ingestion**: Supports PDF, HTML, DOCX, and TXT files
- **Polished UI**: Clean Streamlit interface with dark theme

## Architecture

```
movie-rag-chatbot/
├── app/
│   ├── config.py              # Environment config
│   ├── parsers.py             # PDF/HTML/DOCX/TXT parsers
│   ├── metadata_extractor.py  # Movie metadata extraction
│   ├── chunker.py             # Paragraph-based chunking
│   ├── vector_store.py        # ChromaDB operations
│   ├── multi_query.py         # Multi-query retrieval
│   ├── memory.py              # Conversation memory
│   ├── llm.py                 # LLM answer generation
│   └── pipeline.py            # End-to-end RAG pipeline
├── scripts/
│   ├── ingest.py              # Document ingestion script
│   └── generate_sample_data.py # Sample movie data generator
├── data/
│   ├── raw/                   # Raw document files
│   └── processed/             # Processed metadata
├── vectordb/
│   └── chroma_db/             # Persistent ChromaDB storage
├── streamlit_app.py           # Main Streamlit application
├── requirements.txt
├── .env.example
└── README.md
```

## Quick Start

### 1. Clone & Install

```bash
cd movie-rag-chatbot
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env and add your OpenAI API key
```

### 3. Generate Sample Data & Index

```bash
python -m scripts.generate_sample_data
python -m scripts.ingest
```

### 4. Run the App

```bash
streamlit run streamlit_app.py
```

The app will open at `http://localhost:8501`.

## Adding Your Own Documents

Place PDF, HTML, DOCX, or TXT files in `data/raw/`, then run:

```bash
python -m scripts.ingest
```

**Filename conventions** (for automatic metadata extraction):
- `Movie_Title_2023.txt`
- `inception-2010-scifi.pdf`
- `Parasite (2019).docx`

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | — | Your OpenAI API key (required) |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | OpenAI embedding model |
| `CHAT_MODEL` | `gpt-4o-mini` | OpenAI chat model |
| `CHROMA_PERSIST_DIR` | `./vectordb/chroma_db` | ChromaDB storage path |
| `TOP_K` | `4` | Number of chunks to retrieve |
| `MEMORY_LENGTH` | `8` | Conversation exchanges to remember |

## How It Works

1. **Ingestion**: Documents are parsed → metadata extracted → chunked by paragraph → embedded → stored in ChromaDB
2. **Query**: User question → (optional) multi-query expansion → vector similarity search → top-K chunks retrieved
3. **Generation**: System prompt + chat history + retrieved context + user question → LLM generates grounded answer with citations
4. **Memory**: Last N exchanges preserved for follow-up questions

## Deployment

### Streamlit Community Cloud
1. Push to GitHub
2. Go to [share.streamlit.io](https://share.streamlit.io)
3. Add `OPENAI_API_KEY` in Secrets management
4. Deploy

### Docker
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY . .
RUN pip install -r requirements.txt
RUN python -m scripts.generate_sample_data && python -m scripts.ingest
EXPOSE 8501
CMD ["streamlit", "run", "streamlit_app.py", "--server.port=8501"]
```

### Railway / Render
- Set `OPENAI_API_KEY` as environment variable
- Start command: `streamlit run streamlit_app.py --server.port=$PORT --server.address=0.0.0.0`

## Tech Stack

- **Frontend**: Streamlit
- **LLM**: OpenAI GPT-4o-mini
- **Embeddings**: OpenAI text-embedding-3-small
- **Vector DB**: ChromaDB (persistent local storage)
- **Parsing**: pdfplumber, BeautifulSoup, python-docx
