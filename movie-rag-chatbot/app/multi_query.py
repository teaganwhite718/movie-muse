"""
Multi-Query Retrieval — generates multiple variations of the user query,
retrieves results for each, and merges/deduplicates for better recall.
"""
from typing import List, Dict, Any

import openai

from app.config import OPENAI_API_KEY, CHAT_MODEL, TOP_K
from app.vector_store import retrieve

_client = openai.OpenAI(api_key=OPENAI_API_KEY)


def generate_query_variations(original_query: str, num_variations: int = 3) -> List[str]:
    """
    Use the LLM to generate alternative phrasings of the user's question.
    This improves retrieval recall by capturing different ways to express the same intent.
    """
    prompt = f"""You are a helpful assistant. Given the following user question about movies,
generate {num_variations} alternative versions of this question that capture the same intent
but use different wording, phrasing, or focus on different aspects.

Original question: {original_query}

Return ONLY the alternative questions, one per line, numbered 1-{num_variations}.
Do not include explanations."""

    response = _client.chat.completions.create(
        model=CHAT_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7,
        max_tokens=300,
    )

    raw_text = response.choices[0].message.content.strip()
    variations = []
    for line in raw_text.split("\n"):
        line = line.strip()
        if not line:
            continue
        # Remove numbering like "1.", "1)", "1:"
        cleaned = line.lstrip("0123456789.): ").strip()
        if cleaned:
            variations.append(cleaned)

    return variations[:num_variations]


def multi_query_retrieve(
    original_query: str,
    top_k: int = TOP_K,
    num_variations: int = 3,
) -> List[Dict[str, Any]]:
    """
    Perform Multi-Query Retrieval:
    1. Generate query variations
    2. Retrieve results for each query (original + variations)
    3. Merge and deduplicate by chunk_id
    4. Return the top_k best results sorted by distance
    """
    # Collect all queries
    all_queries = [original_query]
    try:
        variations = generate_query_variations(original_query, num_variations)
        all_queries.extend(variations)
    except Exception:
        # Fall back to single query if variation generation fails
        pass

    # Retrieve for each query
    seen_ids = set()
    all_results: List[Dict[str, Any]] = []

    for query in all_queries:
        results = retrieve(query, top_k=top_k)
        for r in results:
            if r["chunk_id"] not in seen_ids:
                seen_ids.add(r["chunk_id"])
                all_results.append(r)

    # Sort by distance (lower = more similar for cosine)
    all_results.sort(key=lambda x: x["distance"])

    return all_results[:top_k]
