export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: MovieSource[];
  timestamp: Date;
}

export interface MovieSource {
  movie_title: string;
  release_year: string;
  genre: string;
  director: string;
  section: string;
  source: string;
  text: string;
}

export interface AppStatus {
  status: "ready" | "offline" | "loading";
  tmdb_connected: boolean;
  ai_connected: boolean;
  vector_db?: {
    documents: number;
    chunks: number;
    embedded: number;
  };
}
