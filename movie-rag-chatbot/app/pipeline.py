"""
End-to-end RAG pipeline — ties together retrieval, multi-query, and answer generation.
"""
from typing import List, Dict, Any, Tuple

from app.multi_query import multi_query_retrieve
from app.llm import generate_answer
from app.memory import ConversationMemory


def answer_question(
    query: str,
    memory: ConversationMemory,
    use_multi_query: bool = True,
) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Full RAG pipeline:
    1. Retrieve relevant chunks (with optional multi-query)
    2. Generate a grounded answer
    3. Update conversation memory
    
    Returns: (answer_text, retrieved_chunks)
    """
    # Get conversation history for context
    chat_history = memory.get_history()

    # Retrieve relevant chunks
    if use_multi_query:
        retrieved = multi_query_retrieve(query)
    else:
        from app.vector_store import retrieve
        retrieved = retrieve(query)

    # Generate answer
    answer = generate_answer(query, retrieved, chat_history)

    # Update memory
    memory.add_user_message(query)
    memory.add_assistant_message(answer)

    return answer, retrieved
