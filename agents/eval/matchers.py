"""Story/check matching utilities for evaluation scoring."""

from __future__ import annotations

import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Optional

import numpy as np
from openai import OpenAI

_client: Optional[OpenAI] = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI()
    return _client


@dataclass
class Match:
    golden: dict
    system: Optional[dict]
    match_type: str  # "full" | "partial" | "missing"
    similarity: float = 0.0


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    a_arr = np.array(a)
    b_arr = np.array(b)
    dot = np.dot(a_arr, b_arr)
    norm = np.linalg.norm(a_arr) * np.linalg.norm(b_arr)
    if norm == 0:
        return 0.0
    return float(dot / norm)


def embed_text(text: str) -> list[float]:
    """Embed text using OpenAI text-embedding-3-small."""
    resp = _get_client().embeddings.create(
        input=text,
        model="text-embedding-3-small",
    )
    return resp.data[0].embedding


def semantic_similarity(text_a: str, text_b: str) -> float:
    """Compute semantic similarity between two texts via embeddings."""
    emb_a = embed_text(text_a)
    emb_b = embed_text(text_b)
    return cosine_similarity(emb_a, emb_b)


def fuzzy_match(text_a: str, text_b: str) -> float:
    """Levenshtein-based fuzzy match ratio."""
    return SequenceMatcher(None, text_a.lower().strip(), text_b.lower().strip()).ratio()


def normalize_tag(tag: str) -> str:
    """Normalize a tag for comparison: lowercase, strip, remove hyphens/underscores."""
    tag = tag.strip().lower()
    # Remove hyphens and underscores so "risk-engine" == "risk engine" == "risk_engine"
    tag = re.sub(r"[-_]", " ", tag)
    # Collapse multiple spaces
    tag = re.sub(r"\s+", " ", tag).strip()
    return tag


def normalize_tags(tags: list[str]) -> set[str]:
    """Normalize a list of tags into a set.

    Splits tags that contain commas or semicolons into multiple tags,
    then normalizes each one.
    """
    expanded: list[str] = []
    for t in tags:
        if not t:
            continue
        # Split on commas or semicolons
        parts = re.split(r"[,;]", t)
        expanded.extend(parts)
    return {normalize_tag(p) for p in expanded if p.strip()}


def find_best_match(
    golden_story: dict,
    system_stories: list[dict],
) -> tuple[Optional[dict], float]:
    """
    Find the best matching system story for a golden story
    using semantic similarity on title + description.
    """
    golden_text = f"{golden_story.get('title', '')} {golden_story.get('description', '')}"
    best_match = None
    best_sim = 0.0

    for sys_story in system_stories:
        sys_text = f"{sys_story.get('title', '')} {sys_story.get('description', '')}"
        sim = semantic_similarity(golden_text, sys_text)
        if sim > best_sim:
            best_sim = sim
            best_match = sys_story

    return best_match, best_sim


def match_stories(
    golden_stories: list[dict],
    system_stories: list[dict],
) -> list[Match]:
    """Match golden stories to system stories by semantic similarity."""
    matches: list[Match] = []
    used_system = set()

    for golden in golden_stories:
        golden_text = f"{golden.get('title', '')} {golden.get('description', '')}"
        best_match = None
        best_sim = 0.0
        best_idx = -1

        for i, sys_story in enumerate(system_stories):
            if i in used_system:
                continue
            sys_text = f"{sys_story.get('title', '')} {sys_story.get('description', '')}"
            sim = semantic_similarity(golden_text, sys_text)
            if sim > best_sim:
                best_sim = sim
                best_match = sys_story
                best_idx = i

        if best_sim > 0.85:
            matches.append(Match(golden=golden, system=best_match, match_type="full", similarity=best_sim))
            if best_idx >= 0:
                used_system.add(best_idx)
        elif best_sim > 0.60:
            matches.append(Match(golden=golden, system=best_match, match_type="partial", similarity=best_sim))
            if best_idx >= 0:
                used_system.add(best_idx)
        else:
            matches.append(Match(golden=golden, system=None, match_type="missing", similarity=best_sim))

    return matches


def find_story_match(
    story_title: str,
    story_matches: list[Match],
) -> Optional[dict]:
    """Find the system story that matched a golden story by title."""
    for m in story_matches:
        if m.golden.get("title", "").lower() == story_title.lower() and m.system:
            return m.system
    return None


def find_check(
    system_checks: list[dict],
    matched_story: dict,
    check_type: str,
) -> Optional[dict]:
    """Find a system check matching a story + check_type.

    - Story title matching uses fuzzy match (ratio > 0.6).
    - System check_type may be pipe-separated (e.g. "overlap|duplicate");
      match if ANY part matches the golden check_type.
    """
    story_title = matched_story.get("title", "").lower()
    for c in system_checks:
        c_story = c.get("story_title", "").lower()
        c_type = c.get("check_type", "")
        # Fuzzy match story title (ratio > 0.6)
        title_match = (fuzzy_match(c_story, story_title) > 0.6 or
                       story_title in c_story or c_story in story_title)
        # Split pipe-separated check_type and match if any part matches
        c_type_parts = {part.strip() for part in c_type.split("|")}
        type_match = check_type in c_type_parts
        if title_match and type_match:
            return c
    return None


def precision_recall_f1(
    predicted: set[str],
    actual: set[str],
) -> tuple[float, float, float]:
    """Compute precision, recall, and F1 from two sets."""
    if not predicted and not actual:
        return 1.0, 1.0, 1.0
    tp = len(predicted & actual)
    precision = tp / len(predicted) if predicted else 0.0
    recall = tp / len(actual) if actual else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
    return precision, recall, f1


def fuzzy_find_citation(citation: str, transcript: str) -> float:
    """
    Find the best fuzzy match of a citation within a transcript.
    Returns similarity score 0.0–1.0.
    """
    if not citation or not transcript:
        return 0.0

    citation_clean = " ".join(citation.lower().split())
    transcript_clean = " ".join(transcript.lower().split())

    if citation_clean in transcript_clean:
        return 1.0

    citation_words = citation_clean.split()
    transcript_words = transcript_clean.split()
    window_size = len(citation_words)

    if window_size == 0 or len(transcript_words) < window_size:
        return 0.0

    best_ratio = 0.0
    step = max(1, len(transcript_words) // 500)
    for i in range(0, len(transcript_words) - window_size + 1, step):
        window = " ".join(transcript_words[i : i + window_size])
        ratio = SequenceMatcher(None, citation_clean, window).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            if best_ratio >= 0.95:
                break

    return best_ratio
