"""
Fetch 50+ real movie documents from TMDB API and save as .txt files.

Usage:
    python -m scripts.generate_sample_data
    python -m scripts.generate_sample_data --count 60
"""
import os
import sys
import time
import argparse
import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.config import RAW_DATA_DIR, TMDB_API_KEY

TMDB_BASE = "https://api.themoviedb.org/3"


def tmdb_get(endpoint: str, params: dict = None) -> dict:
    """Make a TMDB API request."""
    headers = {
        "Authorization": f"Bearer {TMDB_API_KEY}",
        "accept": "application/json",
    }
    resp = requests.get(f"{TMDB_BASE}/{endpoint}", headers=headers, params=params or {})
    resp.raise_for_status()
    return resp.json()


def fetch_movie_details(movie_id: int) -> dict | None:
    """Fetch full movie details including credits and reviews."""
    try:
        details = tmdb_get(f"movie/{movie_id}", {"append_to_response": "credits,reviews,keywords"})
        return details
    except Exception as e:
        print(f"    ⚠️  Failed to fetch movie {movie_id}: {e}")
        return None


def format_movie_document(movie: dict) -> str:
    """Format a TMDB movie response into a rich text document."""
    title = movie.get("title", "Unknown")
    year = movie.get("release_date", "")[:4] or "Unknown"
    overview = movie.get("overview", "No overview available.")
    runtime = movie.get("runtime", 0)
    vote_avg = movie.get("vote_average", 0)
    vote_count = movie.get("vote_count", 0)
    budget = movie.get("budget", 0)
    revenue = movie.get("revenue", 0)
    tagline = movie.get("tagline", "")
    status = movie.get("status", "")
    original_language = movie.get("original_language", "")

    # Genres
    genres = ", ".join(g["name"] for g in movie.get("genres", []))

    # Production companies & countries
    companies = ", ".join(c["name"] for c in movie.get("production_companies", [])[:5])
    countries = ", ".join(c["name"] for c in movie.get("production_countries", []))

    # Director & key cast from credits
    credits = movie.get("credits", {})
    directors = [c["name"] for c in credits.get("crew", []) if c.get("job") == "Director"]
    director_str = ", ".join(directors) if directors else "Unknown"

    writers = [c["name"] for c in credits.get("crew", [])
               if c.get("job") in ("Screenplay", "Writer", "Story")][:3]
    writer_str = ", ".join(writers) if writers else "Unknown"

    cast_members = credits.get("cast", [])[:10]
    cast_lines = []
    for actor in cast_members:
        cast_lines.append(f"  - {actor['name']} as {actor.get('character', 'Unknown')}")
    cast_str = "\n".join(cast_lines) if cast_lines else "  No cast information available."

    # Keywords
    keywords = movie.get("keywords", {}).get("keywords", [])
    keyword_str = ", ".join(k["name"] for k in keywords[:15]) if keywords else "None listed"

    # Reviews
    reviews = movie.get("reviews", {}).get("results", [])[:3]
    review_section = ""
    if reviews:
        review_parts = []
        for r in reviews:
            author = r.get("author", "Anonymous")
            rating = r.get("author_details", {}).get("rating", "N/A")
            content = r.get("content", "")[:600]
            review_parts.append(
                f'  Review by {author} (Rating: {rating}/10):\n  "{content}..."'
            )
        review_section = "\n\n".join(review_parts)
    else:
        review_section = "  No user reviews available."

    # Format currency
    def fmt_money(val):
        if val and val > 0:
            return f"${val:,.0f}"
        return "Not available"

    doc = f"""Title: {title}
Release Year: {year}
Directed by: {director_str}
Written by: {writer_str}
Genre: {genres}
Runtime: {runtime} minutes
Language: {original_language.upper()}
Status: {status}
Tagline: "{tagline}"

== Plot Summary ==

{overview}

== Cast ==

{cast_str}

== Production ==

Production Companies: {companies}
Production Countries: {countries}
Budget: {fmt_money(budget)}
Box Office Revenue: {fmt_money(revenue)}

== Ratings & Reception ==

TMDB Rating: {vote_avg}/10 (based on {vote_count:,} votes)

User Reviews:

{review_section}

== Keywords & Themes ==

{keyword_str}
"""
    return doc.strip()


def get_top_movie_ids(count: int = 60) -> list[int]:
    """
    Gather movie IDs from multiple TMDB lists to ensure 50+ diverse movies.
    Uses: top rated, popular, and curated genre-based discovery.
    """
    movie_ids = set()

    # Top rated movies (pages 1-3)
    for page in range(1, 4):
        data = tmdb_get("movie/top_rated", {"page": page, "language": "en-US"})
        for m in data.get("results", []):
            movie_ids.add(m["id"])
        time.sleep(0.25)

    # Popular movies
    for page in range(1, 3):
        data = tmdb_get("movie/popular", {"page": page, "language": "en-US"})
        for m in data.get("results", []):
            movie_ids.add(m["id"])
        time.sleep(0.25)

    # Discover by genre for diversity (Sci-Fi=878, Horror=27, Animation=16, Documentary=99)
    for genre_id in [878, 27, 16, 99]:
        data = tmdb_get("discover/movie", {
            "sort_by": "vote_average.desc",
            "vote_count.gte": 1000,
            "with_genres": genre_id,
            "page": 1,
            "language": "en-US",
        })
        for m in data.get("results", []):
            movie_ids.add(m["id"])
        time.sleep(0.25)

    # Return up to requested count
    return list(movie_ids)[:count]


def generate_sample_data(count: int = 55):
    """Fetch movie data from TMDB and save as text documents."""
    if not TMDB_API_KEY:
        print("❌ TMDB_API_KEY not set. Add it to your .env file.")
        print("   Get a free API key at: https://www.themoviedb.org/settings/api")
        return

    os.makedirs(RAW_DATA_DIR, exist_ok=True)

    print(f"🎬 Fetching movie IDs from TMDB...")
    movie_ids = get_top_movie_ids(count)
    print(f"   Found {len(movie_ids)} unique movie IDs")

    saved = 0
    for i, mid in enumerate(movie_ids):
        print(f"  [{i+1}/{len(movie_ids)}] Fetching movie {mid}...", end=" ")
        movie = fetch_movie_details(mid)
        if not movie:
            continue

        title = movie.get("title", "Unknown")
        year = movie.get("release_date", "")[:4] or "0000"

        # Build filename
        safe_title = "".join(c if c.isalnum() or c in " -" else "_" for c in title)
        safe_title = safe_title.replace(" ", "_")
        filename = f"{safe_title}_{year}.txt"
        filepath = os.path.join(RAW_DATA_DIR, filename)

        doc_text = format_movie_document(movie)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(doc_text)

        print(f"✅ {title} ({year})")
        saved += 1
        time.sleep(0.3)  # Rate limit courtesy

    print(f"\n✅ Saved {saved} movie documents to {RAW_DATA_DIR}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch movie data from TMDB")
    parser.add_argument("--count", type=int, default=55, help="Number of movies to fetch")
    args = parser.parse_args()

    print("🎬 Movie RAG Chatbot — TMDB Data Fetcher")
    print("=" * 50)
    generate_sample_data(args.count)
