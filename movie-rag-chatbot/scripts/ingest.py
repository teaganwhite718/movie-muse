"""
Document ingestion script — processes raw movie documents, extracts metadata,
chunks them, and indexes into ChromaDB.

Usage:
    python -m scripts.ingest
    python -m scripts.ingest --data-dir ./data/raw
"""
import os
import sys
import json
import argparse
from typing import List, Dict, Any

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import RAW_DATA_DIR, PROCESSED_DATA_DIR
from app.parsers import parse_file
from app.metadata_extractor import extract_metadata
from app.chunker import chunk_document
from app.vector_store import index_chunks, get_collection_count


def ingest_documents(data_dir: str = RAW_DATA_DIR) -> Dict[str, Any]:
    """
    Process all documents in data_dir:
    1. Parse each supported file
    2. Extract metadata
    3. Chunk into paragraphs
    4. Index chunks into ChromaDB
    
    Returns a summary dict.
    """
    if not os.path.exists(data_dir):
        print(f"❌ Data directory not found: {data_dir}")
        print(f"   Please create it and add movie documents (.pdf, .html, .docx, .txt)")
        return {"error": "Data directory not found"}

    files = [f for f in os.listdir(data_dir) if os.path.isfile(os.path.join(data_dir, f))]
    if not files:
        print(f"❌ No files found in {data_dir}")
        return {"error": "No files found"}

    print(f"📂 Found {len(files)} files in {data_dir}")

    all_chunks: List[Dict[str, Any]] = []
    processed_docs = []
    skipped = []

    for filename in sorted(files):
        filepath = os.path.join(data_dir, filename)
        print(f"  📄 Processing: {filename}...", end=" ")

        # Parse
        parsed = parse_file(filepath)
        if parsed is None:
            print("⏭️  Skipped (unsupported format)")
            skipped.append(filename)
            continue

        if not parsed.get("text", "").strip():
            print("⏭️  Skipped (no text extracted)")
            skipped.append(filename)
            continue

        # Extract metadata
        enriched = extract_metadata(parsed)

        # Chunk
        chunks = chunk_document(enriched)
        print(f"✅ {len(chunks)} chunks")

        all_chunks.extend(chunks)
        processed_docs.append({
            "file": filename,
            "title": enriched.get("movie_title", "Unknown"),
            "year": enriched.get("release_year", "Unknown"),
            "genre": enriched.get("genre", "Unknown"),
            "director": enriched.get("director", "Unknown"),
            "num_chunks": len(chunks),
        })

    if not all_chunks:
        print("❌ No chunks generated from any document.")
        return {"error": "No chunks generated"}

    # Save processed metadata
    os.makedirs(PROCESSED_DATA_DIR, exist_ok=True)
    metadata_path = os.path.join(PROCESSED_DATA_DIR, "documents_metadata.json")
    with open(metadata_path, "w") as f:
        json.dump(processed_docs, f, indent=2)
    print(f"\n💾 Saved document metadata to {metadata_path}")

    # Index into ChromaDB
    print(f"\n🔄 Indexing {len(all_chunks)} chunks into ChromaDB...")
    num_indexed = index_chunks(all_chunks)
    print(f"✅ Indexed {num_indexed} chunks")
    print(f"📊 Total chunks in collection: {get_collection_count()}")

    summary = {
        "files_processed": len(processed_docs),
        "files_skipped": len(skipped),
        "total_chunks": len(all_chunks),
        "chunks_indexed": num_indexed,
        "documents": processed_docs,
        "skipped_files": skipped,
    }

    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest movie documents into ChromaDB")
    parser.add_argument("--data-dir", default=RAW_DATA_DIR, help="Directory containing raw documents")
    args = parser.parse_args()

    print("🎬 Movie RAG Chatbot — Document Ingestion")
    print("=" * 50)
    summary = ingest_documents(args.data_dir)
    print("\n" + "=" * 50)
    print("📋 Ingestion Summary:")
    print(json.dumps(summary, indent=2))
