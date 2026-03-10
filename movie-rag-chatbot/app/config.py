"""
Configuration module — loads settings from environment variables.
"""
import os
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
CHAT_MODEL = os.getenv("CHAT_MODEL", "gpt-4o-mini")
CHROMA_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", "./vectordb/chroma_db")
CHROMA_COLLECTION = "movie_chunks"
TOP_K = int(os.getenv("TOP_K", "4"))
MEMORY_LENGTH = int(os.getenv("MEMORY_LENGTH", "8"))
RAW_DATA_DIR = "./data/raw"
PROCESSED_DATA_DIR = "./data/processed"
