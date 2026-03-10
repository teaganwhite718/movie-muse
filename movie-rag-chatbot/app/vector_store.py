"""
ChromaDB vector store with persistent storage.
Handles embedding, indexing, and retrieval of document chunks.
"""
import os
from typing import List, Dict, Any

import chromadb
from chromadb.config import Settings
import openai

from app.config import OPENAI_API_KEY, EMBEDDING_MODEL, CHROMA_PERSIST_DIR, CHROMA_COLLECTION, TOP_K


# Initialize OpenAI client
_openai_client = openai.OpenAI(api_key=OPENAI_API_KEY)


def get_chroma_client() -> chromadb.ClientAPI:
    """Get or create a persistent ChromaDB client."""
    os.makedirs(CHROMA_PERSIST_DIR, exist_ok=True)
    return chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)


def get_collection(client: chromadb.ClientAPI = None):
    """Get or create the movie chunks collection."""
    if client is None:
        client = get_chroma_client()
    return client.get_or_create_collection(
        name=CHROMA_COLLECTION,
        metadata={"hnsw:space": "cosine"},
    )


def embed_text(text: str) -> List[float]:
    """Generate an embedding for a single text string using OpenAI."""
    response = _openai_client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=text,
    )
    return response.data[0].embedding


def embed_texts(texts: List[str]) -> List[List[float]]:
    """Generate embeddings for a batch of texts."""
    response = _openai_client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=texts,
    )
    return [item.embedding for item in response.data]


def index_chunks(chunks: List[Dict[str, Any]]) -> int:
    """
    Index a list of chunks into ChromaDB.
    Returns the number of chunks indexed.
    """
    if not chunks:
        return 0

    collection = get_collection()

    # Process in batches of 100 (OpenAI embedding API limit)
    batch_size = 100
    total_indexed = 0

    for i in range(0, len(chunks), batch_size):
        batch = chunks[i : i + batch_size]
        texts = [c["text"] for c in batch]
        ids = [c["chunk_id"] for c in batch]
        embeddings = embed_texts(texts)

        # Prepare metadata (ChromaDB only accepts str, int, float, bool)
        metadatas = []
        for c in batch:
            metadatas.append({
                "document_id": str(c.get("document_id", "")),
                "movie_title": str(c.get("movie_title", "")),
                "release_year": str(c.get("release_year", "")),
                "genre": str(c.get("genre", "")),
                "director": str(c.get("director", "")),
                "section": str(c.get("section", "")),
                "source_file": str(c.get("source_file", "")),
                "doc_type": str(c.get("doc_type", "")),
            })

        collection.upsert(
            ids=ids,
            embeddings=embeddings,
            documents=texts,
            metadatas=metadatas,
        )
        total_indexed += len(batch)

    return total_indexed


def retrieve(query: str, top_k: int = TOP_K) -> List[Dict[str, Any]]:
    """
    Embed a query and retrieve the top_k most relevant chunks.
    Returns a list of dicts with 'text', 'metadata', and 'score'.
    """
    collection = get_collection()
    query_embedding = embed_text(query)

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=top_k,
        include=["documents", "metadatas", "distances"],
    )

    retrieved = []
    if results and results["ids"] and results["ids"][0]:
        for idx in range(len(results["ids"][0])):
            retrieved.append({
                "chunk_id": results["ids"][0][idx],
                "text": results["documents"][0][idx],
                "metadata": results["metadatas"][0][idx],
                "distance": results["distances"][0][idx],
            })
    return retrieved


def get_collection_count() -> int:
    """Return the number of chunks currently stored."""
    try:
        collection = get_collection()
        return collection.count()
    except Exception:
        return 0
