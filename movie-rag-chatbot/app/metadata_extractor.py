"""
Metadata extraction — attempts to pull movie title, year, genre, director
from the filename and document text using simple heuristics.
"""
import re
import os
from typing import Dict, Any


def extract_metadata(raw: Dict[str, Any]) -> Dict[str, Any]:
    """
    Enrich a parsed document dict with movie metadata.
    Uses filename conventions and text heuristics.

    Expected filename patterns (any of these work):
        The_Godfather_1972.txt
        inception-2010-scifi.pdf
        Parasite (2019).docx
    """
    source = raw.get("source_file", "")
    text = raw.get("text", "")
    name_no_ext = os.path.splitext(source)[0]

    # --- Movie title ---
    # Remove year patterns and clean separators
    title_clean = re.sub(r"[\(\)\[\]]", " ", name_no_ext)
    title_clean = re.sub(r"(19|20)\d{2}", "", title_clean)
    title_clean = re.sub(r"[_\-]+", " ", title_clean).strip()
    title = title_clean.title() if title_clean else "Unknown"

    # --- Release year ---
    year_match = re.search(r"((?:19|20)\d{2})", name_no_ext)
    year = year_match.group(1) if year_match else ""
    if not year:
        year_match = re.search(r"((?:19|20)\d{2})", text[:500])
        year = year_match.group(1) if year_match else "Unknown"

    # --- Genre (from filename or first 1000 chars) ---
    genre_keywords = [
        "action", "adventure", "animation", "comedy", "crime", "documentary",
        "drama", "fantasy", "horror", "mystery", "romance", "sci-fi", "scifi",
        "science fiction", "thriller", "war", "western", "musical", "biography",
        "family", "sport", "history", "noir",
    ]
    detected_genres = []
    search_text = (name_no_ext + " " + text[:1000]).lower()
    for g in genre_keywords:
        if g in search_text:
            detected_genres.append(g.replace("scifi", "sci-fi").title())
    genre = ", ".join(detected_genres[:3]) if detected_genres else "Unknown"

    # --- Director (simple heuristic) ---
    dir_match = re.search(
        r"(?:directed by|director[:\s]+)([A-Z][a-z]+ [A-Z][a-z]+)",
        text[:3000],
        re.IGNORECASE,
    )
    director = dir_match.group(1).strip() if dir_match else "Unknown"

    raw["movie_title"] = title
    raw["release_year"] = year
    raw["genre"] = genre
    raw["director"] = director

    return raw
