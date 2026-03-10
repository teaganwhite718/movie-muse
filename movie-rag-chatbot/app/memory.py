"""
Conversation memory — tracks the last N exchanges for multi-turn context.
"""
from typing import List, Dict
from app.config import MEMORY_LENGTH


class ConversationMemory:
    """
    Simple sliding-window conversation memory.
    Stores the last MEMORY_LENGTH user/assistant message pairs.
    """

    def __init__(self, max_exchanges: int = MEMORY_LENGTH):
        self.max_exchanges = max_exchanges
        self.history: List[Dict[str, str]] = []

    def add_user_message(self, message: str):
        self.history.append({"role": "user", "content": message})
        self._trim()

    def add_assistant_message(self, message: str):
        self.history.append({"role": "assistant", "content": message})
        self._trim()

    def get_history(self) -> List[Dict[str, str]]:
        """Return the current conversation history."""
        return list(self.history)

    def clear(self):
        """Clear all conversation history."""
        self.history = []

    def _trim(self):
        """Keep only the last max_exchanges * 2 messages (pairs)."""
        max_messages = self.max_exchanges * 2
        if len(self.history) > max_messages:
            self.history = self.history[-max_messages:]
