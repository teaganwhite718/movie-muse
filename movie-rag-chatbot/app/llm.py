"""
LLM answer generation — builds prompts with context and generates grounded answers.
"""
from typing import List, Dict, Any

import openai

from app.config import OPENAI_API_KEY, CHAT_MODEL

_client = openai.OpenAI(api_key=OPENAI_API_KEY)

SYSTEM_PROMPT = """You are CineBot, an expert movie knowledge assistant. You answer questions about movies
using ONLY the retrieved source documents provided to you. Follow these rules strictly:

1. Base your answers exclusively on the provided context passages.
2. If the context does not contain enough information to answer, say: "I don't have enough information in my sources to answer that question."
3. Be clear, concise, and helpful.
4. At the end of your answer, include a "Sources" section listing the movie title and source file for each passage you used.
5. Format sources like:
   📎 Sources:
   - [Movie Title] (source_file.ext, Section: section_name)
6. When comparing movies, clearly organize your response with headings for each movie.
7. Handle follow-up questions by considering the conversation history provided.
"""


def build_context_block(retrieved_chunks: List[Dict[str, Any]]) -> str:
    """Format retrieved chunks into a context block for the LLM prompt."""
    if not retrieved_chunks:
        return "No relevant documents were found."

    blocks = []
    for i, chunk in enumerate(retrieved_chunks, 1):
        meta = chunk.get("metadata", {})
        header = (
            f"[Source {i}] Movie: {meta.get('movie_title', 'Unknown')} | "
            f"Year: {meta.get('release_year', 'N/A')} | "
            f"Genre: {meta.get('genre', 'N/A')} | "
            f"Director: {meta.get('director', 'N/A')} | "
            f"Section: {meta.get('section', 'General')} | "
            f"File: {meta.get('source_file', 'unknown')}"
        )
        blocks.append(f"{header}\n{chunk['text']}")

    return "\n\n---\n\n".join(blocks)


def generate_answer(
    user_query: str,
    retrieved_chunks: List[Dict[str, Any]],
    chat_history: List[Dict[str, str]],
) -> str:
    """
    Generate an answer using the LLM with retrieved context and conversation history.
    """
    context_block = build_context_block(retrieved_chunks)

    # Build messages array
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    # Add conversation history (for multi-turn context)
    if chat_history:
        messages.extend(chat_history)

    # Add the current query with context
    user_message = f"""Based on the following retrieved movie documents, answer my question.

--- RETRIEVED CONTEXT ---
{context_block}
--- END CONTEXT ---

My question: {user_query}"""

    messages.append({"role": "user", "content": user_message})

    response = _client.chat.completions.create(
        model=CHAT_MODEL,
        messages=messages,
        temperature=0.3,
        max_tokens=1500,
    )

    return response.choices[0].message.content.strip()
