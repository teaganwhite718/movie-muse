"""
Paragraph-based chunking with metadata propagation.
Keeps chunks semantically coherent by splitting on paragraph boundaries.
"""
import uuid
import re
from typing import Dict, Any, List

# Target chunk size in characters (~300-500 words)
MAX_CHUNK_CHARS = 1500
MIN_CHUNK_CHARS = 200


def chunk_document(doc: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Split a document into paragraph-based chunks.
    Each chunk inherits the document's metadata.
    """
    text = doc.get("text", "")
    if not text.strip():
        return []

    # Split on double newlines (paragraph boundaries)
    paragraphs = re.split(r"\n{2,}", text)
    paragraphs = [p.strip() for p in paragraphs if p.strip()]

    chunks: List[Dict[str, Any]] = []
    current_chunk = ""
    section = "General"

    # Try to detect section headers (ALL CAPS or lines ending with colon)
    section_pattern = re.compile(r"^(?:[A-Z][A-Z\s]{3,}|.{3,50}:)\s*$")

    for para in paragraphs:
        # Detect section headers
        if section_pattern.match(para) and len(para) < 80:
            section = para.strip().rstrip(":").title()
            continue

        # If adding this paragraph exceeds max, flush current chunk
        if current_chunk and len(current_chunk) + len(para) > MAX_CHUNK_CHARS:
            chunks.append(_make_chunk(current_chunk, doc, section, len(chunks)))
            current_chunk = para
        else:
            current_chunk = f"{current_chunk}\n\n{para}" if current_chunk else para

    # Flush remaining text
    if current_chunk and len(current_chunk) >= MIN_CHUNK_CHARS:
        chunks.append(_make_chunk(current_chunk, doc, section, len(chunks)))
    elif current_chunk and chunks:
        # Append short leftover to the last chunk
        chunks[-1]["text"] += "\n\n" + current_chunk

    return chunks


def _make_chunk(text: str, doc: Dict[str, Any], section: str, idx: int) -> Dict[str, Any]:
    """Create a chunk dict with propagated metadata."""
    doc_id = doc.get("source_file", "unknown")
    return {
        "chunk_id": f"{doc_id}::chunk_{idx}",
        "text": text.strip(),
        "document_id": doc_id,
        "movie_title": doc.get("movie_title", "Unknown"),
        "release_year": doc.get("release_year", "Unknown"),
        "genre": doc.get("genre", "Unknown"),
        "director": doc.get("director", "Unknown"),
        "section": section,
        "source_file": doc.get("source_file", "Unknown"),
        "doc_type": doc.get("doc_type", "Unknown"),
    }
