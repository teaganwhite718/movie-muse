"""
🎬 CineBot — Movie RAG Chatbot
Streamlit application with conversational UI, source citations, and multi-query retrieval.
"""
import streamlit as st
from app.config import CHROMA_PERSIST_DIR, TOP_K, OPENAI_API_KEY
from app.memory import ConversationMemory
from app.pipeline import answer_question
from app.vector_store import get_collection_count

# ─── Page Config ─────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="CineBot — Movie Knowledge Assistant",
    page_icon="🎬",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ─── Custom CSS ──────────────────────────────────────────────────────────────
st.markdown("""
<style>
    /* Main background */
    .stApp {
        background: linear-gradient(135deg, #0f0f23 0%, #1a1a3e 50%, #0d0d1f 100%);
    }

    /* Sidebar styling */
    [data-testid="stSidebar"] {
        background: linear-gradient(180deg, #141428 0%, #1e1e3a 100%);
        border-right: 1px solid rgba(255, 255, 255, 0.06);
    }

    /* Chat message containers */
    [data-testid="stChatMessage"] {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 12px;
        padding: 1rem;
        margin-bottom: 0.5rem;
    }

    /* Chat input styling */
    [data-testid="stChatInput"] textarea {
        background: rgba(255, 255, 255, 0.05) !important;
        border: 1px solid rgba(255, 255, 255, 0.1) !important;
        border-radius: 12px !important;
        color: #e0e0e0 !important;
    }

    /* Expander styling for sources */
    .streamlit-expanderHeader {
        background: rgba(255, 255, 255, 0.03);
        border-radius: 8px;
        font-size: 0.9rem;
    }

    /* Headers */
    h1, h2, h3 {
        color: #e8e8f0 !important;
    }

    /* Divider */
    hr {
        border-color: rgba(255, 255, 255, 0.08) !important;
    }

    /* Metric styling */
    [data-testid="stMetric"] {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 10px;
        padding: 1rem;
    }

    /* Source citation card */
    .source-card {
        background: rgba(99, 102, 241, 0.08);
        border: 1px solid rgba(99, 102, 241, 0.2);
        border-radius: 8px;
        padding: 0.75rem 1rem;
        margin-bottom: 0.5rem;
        font-size: 0.85rem;
    }

    /* Button styling */
    .stButton > button {
        border-radius: 8px;
        border: 1px solid rgba(99, 102, 241, 0.3);
        background: rgba(99, 102, 241, 0.1);
        color: #c4c4f0;
        transition: all 0.2s;
    }
    .stButton > button:hover {
        background: rgba(99, 102, 241, 0.2);
        border-color: rgba(99, 102, 241, 0.5);
    }
</style>
""", unsafe_allow_html=True)


# ─── Session State Init ──────────────────────────────────────────────────────
if "memory" not in st.session_state:
    st.session_state.memory = ConversationMemory()
if "messages" not in st.session_state:
    st.session_state.messages = []
if "use_multi_query" not in st.session_state:
    st.session_state.use_multi_query = True


# ─── Sidebar ─────────────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown("## 🎬 CineBot")
    st.markdown(
        "Your AI-powered movie knowledge assistant. "
        "Ask me anything about movies — plots, directors, awards, themes, "
        "comparisons, and more!"
    )

    st.divider()

    # Stats
    chunk_count = get_collection_count()
    col1, col2 = st.columns(2)
    with col1:
        st.metric("📚 Indexed Chunks", chunk_count)
    with col2:
        st.metric("💬 Messages", len(st.session_state.messages))

    st.divider()

    # Settings
    st.markdown("### ⚙️ Settings")

    st.session_state.use_multi_query = st.toggle(
        "🔀 Multi-Query Retrieval",
        value=st.session_state.use_multi_query,
        help="Generate multiple query variations for better retrieval recall",
    )

    st.divider()

    # Actions
    st.markdown("### 🛠️ Actions")

    if st.button("🗑️ Clear Chat", use_container_width=True):
        st.session_state.messages = []
        st.session_state.memory.clear()
        st.rerun()

    if st.button("🔄 Re-index Documents", use_container_width=True):
        with st.spinner("Ingesting documents..."):
            try:
                from scripts.ingest import ingest_documents
                summary = ingest_documents()
                if "error" not in summary:
                    st.success(
                        f"✅ Indexed {summary.get('total_chunks', 0)} chunks "
                        f"from {summary.get('files_processed', 0)} files"
                    )
                else:
                    st.error(f"❌ {summary['error']}")
            except Exception as e:
                st.error(f"❌ Ingestion failed: {e}")

    st.divider()

    # Example questions
    st.markdown("### 💡 Try asking")
    examples = [
        "What is Inception about?",
        "Compare The Godfather and Goodfellas",
        "Which movies won Best Picture?",
        "What themes does Parasite explore?",
        "Who directed The Dark Knight?",
        "Recommend me a sci-fi movie",
    ]
    for ex in examples:
        if st.button(f"→ {ex}", key=f"ex_{ex}", use_container_width=True):
            st.session_state.pending_question = ex
            st.rerun()

    st.divider()
    st.caption("Built with Streamlit • OpenAI • ChromaDB")


# ─── Validation ──────────────────────────────────────────────────────────────
if not OPENAI_API_KEY:
    st.error(
        "⚠️ OpenAI API key not configured. "
        "Please set `OPENAI_API_KEY` in your `.env` file."
    )
    st.stop()

if get_collection_count() == 0:
    st.warning(
        "📭 No documents indexed yet. Click **Re-index Documents** in the sidebar, "
        "or run `python -m scripts.generate_sample_data && python -m scripts.ingest`."
    )


# ─── Main Chat Area ─────────────────────────────────────────────────────────
st.markdown("# 🎬 CineBot")
st.markdown("*Your AI movie knowledge assistant — powered by RAG*")
st.divider()

# Display chat history
for msg in st.session_state.messages:
    with st.chat_message(msg["role"], avatar="🎬" if msg["role"] == "assistant" else "🧑"):
        st.markdown(msg["content"])

        # Show sources if available
        if msg["role"] == "assistant" and "sources" in msg:
            sources = msg["sources"]
            if sources:
                with st.expander(f"📎 View {len(sources)} source(s)", expanded=False):
                    for i, src in enumerate(sources, 1):
                        meta = src.get("metadata", {})
                        st.markdown(
                            f"""<div class="source-card">
                            <strong>Source {i}:</strong> {meta.get('movie_title', 'Unknown')}
                            ({meta.get('release_year', 'N/A')}) •
                            Section: {meta.get('section', 'General')} •
                            File: <code>{meta.get('source_file', 'N/A')}</code><br>
                            <small style="color: #a0a0c0;">{src.get('text', '')[:300]}...</small>
                            </div>""",
                            unsafe_allow_html=True,
                        )


# ─── Handle Input ────────────────────────────────────────────────────────────
# Check for pending question from sidebar example buttons
pending = st.session_state.pop("pending_question", None)
user_input = st.chat_input("Ask me about movies...") or pending

if user_input:
    # Display user message
    with st.chat_message("user", avatar="🧑"):
        st.markdown(user_input)

    st.session_state.messages.append({"role": "user", "content": user_input})

    # Generate response
    with st.chat_message("assistant", avatar="🎬"):
        with st.spinner("Searching movie knowledge base..."):
            try:
                answer, retrieved_chunks = answer_question(
                    query=user_input,
                    memory=st.session_state.memory,
                    use_multi_query=st.session_state.use_multi_query,
                )

                st.markdown(answer)

                # Show sources
                if retrieved_chunks:
                    with st.expander(f"📎 View {len(retrieved_chunks)} source(s)", expanded=False):
                        for i, src in enumerate(retrieved_chunks, 1):
                            meta = src.get("metadata", {})
                            st.markdown(
                                f"""<div class="source-card">
                                <strong>Source {i}:</strong> {meta.get('movie_title', 'Unknown')}
                                ({meta.get('release_year', 'N/A')}) •
                                Section: {meta.get('section', 'General')} •
                                File: <code>{meta.get('source_file', 'N/A')}</code><br>
                                <small style="color: #a0a0c0;">{src.get('text', '')[:300]}...</small>
                                </div>""",
                                unsafe_allow_html=True,
                            )

                st.session_state.messages.append({
                    "role": "assistant",
                    "content": answer,
                    "sources": retrieved_chunks,
                })

            except Exception as e:
                error_msg = f"❌ Error generating response: {str(e)}"
                st.error(error_msg)
                st.session_state.messages.append({
                    "role": "assistant",
                    "content": error_msg,
                })

    st.rerun()
