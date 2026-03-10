"""
Document parsers for PDF, HTML, DOCX, and TXT files.
Extracts clean text and metadata from each file type.
"""
import os
import re
from typing import Dict, Any

import pdfplumber
from bs4 import BeautifulSoup
from docx import Document as DocxDocument


def parse_pdf(filepath: str) -> Dict[str, Any]:
    """Extract text from a PDF file."""
    text_pages = []
    with pdfplumber.open(filepath) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_pages.append(page_text)
    return {
        "text": "\n\n".join(text_pages),
        "doc_type": "pdf",
        "source_file": os.path.basename(filepath),
    }


def parse_html(filepath: str) -> Dict[str, Any]:
    """Extract text from an HTML file."""
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        soup = BeautifulSoup(f.read(), "lxml")
    # Remove script/style elements
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()
    text = soup.get_text(separator="\n", strip=True)
    return {
        "text": text,
        "doc_type": "html",
        "source_file": os.path.basename(filepath),
    }


def parse_docx(filepath: str) -> Dict[str, Any]:
    """Extract text from a DOCX file."""
    doc = DocxDocument(filepath)
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return {
        "text": "\n\n".join(paragraphs),
        "doc_type": "docx",
        "source_file": os.path.basename(filepath),
    }


def parse_txt(filepath: str) -> Dict[str, Any]:
    """Extract text from a plain text file."""
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        text = f.read()
    return {
        "text": text,
        "doc_type": "txt",
        "source_file": os.path.basename(filepath),
    }


# Registry mapping extensions to parser functions
PARSERS = {
    ".pdf": parse_pdf,
    ".html": parse_html,
    ".htm": parse_html,
    ".docx": parse_docx,
    ".txt": parse_txt,
}


def parse_file(filepath: str) -> Dict[str, Any] | None:
    """Parse a file based on its extension. Returns None for unsupported types."""
    ext = os.path.splitext(filepath)[1].lower()
    parser = PARSERS.get(ext)
    if parser is None:
        return None
    return parser(filepath)
