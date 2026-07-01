#!/usr/bin/env python3
"""Scrape practice questions from lifeintheuktestweb.co.uk into data/questions.json.

Page anatomy (static HTML, no JS execution needed):
- Each quiz page holds 24 `.container_question` blocks: question text in
  `.question_text .question`, options in `ul.container_answer li label`,
  explanation in `.container_explication`.
- Correct answers are embedded as `const solution = {"p0":"r1","p7":"r1,r2",...}`.
- URL patterns: test-N (general series), test-C-M (chapter C practice,
  test-1-2 covers chapters 1&2 -> chapter null), british-citizenship-test-N /
  *exam* (mock exams).

Raw HTML is cached gzipped under data/raw/ so the scrape is reproducible
without re-hitting the site (delete the cache to force a refetch).
"""

import gzip
import json
import re
import sys
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT_QUESTIONS = ROOT / "data" / "questions.json"
OUT_TESTS = ROOT / "data" / "tests.json"

BASE = "https://lifeintheuktestweb.co.uk"
SEEDS = [
    "",
    "tests",
    "exams",
    "the-values-and-principles-of-the-uk",
    "what-is-the-uk",
    "a-long-and-illustrious-history",
    "a-modern-thriving-society",
    "the-uk-government-the-law-and-your-role",
]
QUIZ_SLUG = re.compile(
    r"^(test-[\d-]+|exam-\d+|exams-[\d-]+|life-in-the-uk-exam-\d+"
    r"|british-citizenship-test[\w-]*|british-naturalization-test-\d+"
    r"|audio-british-citizenship-test-\d+)$"
)
RATE_LIMIT_S = 1.5
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}

_last_fetch = 0.0


def fetch(slug: str) -> str:
    """GET a page, gzip-cached under data/raw/<slug>.html.gz."""
    global _last_fetch
    cache = RAW / f"{slug or 'home'}.html.gz"
    if cache.exists():
        return gzip.decompress(cache.read_bytes()).decode("utf-8", "replace")
    wait = RATE_LIMIT_S - (time.time() - _last_fetch)
    if wait > 0:
        time.sleep(wait)
    r = requests.get(f"{BASE}/{slug}/" if slug else BASE, headers=UA, timeout=30)
    _last_fetch = time.time()
    r.raise_for_status()
    RAW.mkdir(parents=True, exist_ok=True)
    cache.write_bytes(gzip.compress(r.content))
    return r.text


def discover() -> list[str]:
    slugs = set()
    for seed in SEEDS:
        soup = BeautifulSoup(fetch(seed), "html.parser")
        for a in soup.find_all("a", href=True):
            m = re.match(rf"{re.escape(BASE)}/([\w-]+)/?$", a["href"])
            if m and QUIZ_SLUG.match(m.group(1)):
                slugs.add(m.group(1))
    return sorted(slugs)


def chapter_of(slug: str) -> int | None:
    m = re.match(r"^test-(\d)-\d+$", slug)
    if not m:
        return None
    ch = int(m.group(1))
    if slug == "test-1-2":  # "CHAPTERS 1 & 2" combined test
        return None
    return ch


def test_kind(slug: str) -> str:
    if re.match(r"^test-\d-\d+$", slug):
        return "chapter"
    if re.match(r"^test-\d+$", slug):
        return "general"
    return "exam"


def test_num(slug: str) -> int:
    """Ordinal within its series; every slug ends with its number
    (exam slugs vary in prefix but map to Exams 1-17 on the site index)."""
    m = re.search(r"(\d+)$", slug)
    return int(m.group(1)) if m else 0


def parse_quiz(slug: str, html: str):
    soup = BeautifulSoup(html, "html.parser")
    blocks = soup.select(".container_question")
    m = re.search(r"const solution = (\{[^}]*\})", html)
    if not blocks or not m:
        return None
    solution = json.loads(m.group(1))
    title = soup.title.string.strip() if soup.title and soup.title.string else slug
    chapter = chapter_of(slug)
    questions = []
    for b in blocks:
        pid = b.get("data-id_question", "")
        qdiv = b.select_one(".question_text .question")
        if qdiv is None or pid not in solution:
            continue
        # option ids are not always 0-based (True/False questions use r1/r2),
        # so resolve the solution's rN ids against each input's data-id_answer
        options, rids = [], []
        for label in b.select("ul.container_answer li label"):
            inp = label.find("input")
            rids.append(inp.get("data-id_answer") if inp else None)
            options.append({"en": label.get_text(" ", strip=True), "zh": None})
        wanted = solution[pid].split(",")
        if not all(r in rids for r in wanted):
            print(f"  WARN {slug} {pid}: solution {wanted} not in options {rids}",
                  file=sys.stderr)
            continue
        answer = sorted(rids.index(r) for r in wanted)
        expl = b.select_one(".container_explication")
        expl_text = expl.get_text(" ", strip=True) if expl else ""
        qnum = int(pid[1:]) + 1
        questions.append(
            {
                "id": f"q-{slug}-{qnum:02d}",
                "source": f"{BASE}/{slug}/",
                "test": slug,
                "chapter": chapter,
                "question_en": qdiv.get_text(" ", strip=True),
                "question_zh": None,
                "options": options,
                "answer": answer,
                "explanation_en": expl_text,
                "explanation_zh": None,
                "linked_content": [],
            }
        )
    return {"slug": slug, "title": title, "chapter": chapter,
            "kind": test_kind(slug), "questions": questions}


def main():
    slugs = discover()
    print(f"discovered {len(slugs)} candidate quiz pages")
    all_questions, tests, skipped = [], [], []
    for i, slug in enumerate(slugs, 1):
        try:
            parsed = parse_quiz(slug, fetch(slug))
        except requests.RequestException as e:
            print(f"  FETCH FAILED {slug}: {e}", file=sys.stderr)
            skipped.append(slug)
            continue
        if parsed is None:
            skipped.append(slug)
            continue
        all_questions.extend(parsed["questions"])
        tests.append(
            {
                "slug": parsed["slug"],
                "title": parsed["title"],
                "chapter": parsed["chapter"],
                "kind": parsed["kind"],
                "num": test_num(parsed["slug"]),
                "count": len(parsed["questions"]),
            }
        )
        print(f"  [{i}/{len(slugs)}] {slug}: {len(parsed['questions'])} questions")
    OUT_QUESTIONS.write_text(
        json.dumps(all_questions, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    OUT_TESTS.write_text(json.dumps(tests, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nwrote {len(all_questions)} questions from {len(tests)} tests")
    if skipped:
        print(f"skipped (no quiz content): {skipped}")


if __name__ == "__main__":
    main()
