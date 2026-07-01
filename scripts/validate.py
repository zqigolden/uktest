#!/usr/bin/env python3
"""Deterministic validation of data/content.json and data/questions.json.

Run after every content-enrichment merge (see AI_TASKS.md). Exits non-zero on
errors; prints translation-coverage stats as info.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

CONTENT_FIELDS = {
    "id": str, "chapter": int, "section": str, "heading": str,
    "type": str, "en": str,
    # nullable: subheading, zh, en_simple, exam_note_zh
}
QUESTION_FIELDS = {
    "id": str, "source": str, "test": str, "question_en": str,
    "options": list, "answer": list, "explanation_en": str,
    "linked_content": list,
    # nullable: chapter, question_zh, explanation_zh
}

errors: list[str] = []
warnings: list[str] = []


def err(msg: str):
    errors.append(msg)


def check_fields(item: dict, spec: dict, label: str):
    for field, typ in spec.items():
        if field not in item:
            err(f"{label}: missing field '{field}'")
        elif item[field] is not None and not isinstance(item[field], typ):
            err(f"{label}: field '{field}' has type {type(item[field]).__name__}, want {typ.__name__}")


def main():
    content = json.loads((DATA / "content.json").read_text(encoding="utf-8"))
    questions_path = DATA / "questions.json"
    questions = (
        json.loads(questions_path.read_text(encoding="utf-8"))
        if questions_path.exists()
        else []
    )

    # --- content.json ---
    content_ids = set()
    for u in content:
        label = f"content {u.get('id', '?')}"
        check_fields(u, CONTENT_FIELDS, label)
        uid = u.get("id")
        if uid in content_ids:
            err(f"{label}: duplicate id")
        content_ids.add(uid)
        if not (u.get("en") or "").strip():
            err(f"{label}: empty 'en'")
        if u.get("chapter") not in (1, 2, 3, 4, 5, 6):
            err(f"{label}: chapter out of range: {u.get('chapter')}")
        if u.get("zh") is not None and not str(u["zh"]).strip():
            err(f"{label}: 'zh' present but blank")

    # --- questions.json ---
    qids = set()
    for q in questions:
        label = f"question {q.get('id', '?')}"
        check_fields(q, QUESTION_FIELDS, label)
        qid = q.get("id")
        if qid in qids:
            err(f"{label}: duplicate id")
        qids.add(qid)
        opts = q.get("options") or []
        if len(opts) < 2:
            err(f"{label}: fewer than 2 options")
        for o in opts:
            if not (o.get("en") or "").strip():
                err(f"{label}: empty option text")
        ans = q.get("answer") or []
        if not ans:
            err(f"{label}: empty answer")
        if any(not isinstance(a, int) or a < 0 or a >= len(opts) for a in ans):
            err(f"{label}: answer index out of range: {ans}")
        for cid in q.get("linked_content") or []:
            if cid not in content_ids:
                err(f"{label}: linked_content id not found: {cid}")
        if q.get("chapter") is not None and q["chapter"] not in (1, 2, 3, 4, 5):
            err(f"{label}: chapter out of range: {q['chapter']}")

    # --- coverage stats (informational) ---
    def coverage(items, field):
        done = sum(1 for i in items if i.get(field))
        return f"{done}/{len(items)}"

    print(f"content units: {len(content)}")
    print(f"  zh translated:      {coverage(content, 'zh')}")
    print(f"  en_simple written:  {coverage(content, 'en_simple')}")
    print(f"  exam points:        {sum(1 for u in content if u.get('is_exam_point'))}")
    print(f"questions: {len(questions)}")
    print(f"  question_zh:        {coverage(questions, 'question_zh')}")
    print(f"  explanation_zh:     {coverage(questions, 'explanation_zh')}")
    print(f"  linked to content:  {sum(1 for q in questions if q.get('linked_content'))}")
    esc = sum(
        1
        for i in content + questions
        for v in i.values()
        if v == "ESCALATE"
    )
    if esc:
        warnings.append(f"{esc} ESCALATE markers awaiting Fable review")

    for w in warnings:
        print(f"WARN: {w}")
    if errors:
        print(f"\n{len(errors)} ERRORS:", file=sys.stderr)
        for e in errors[:50]:
            print(f"  {e}", file=sys.stderr)
        if len(errors) > 50:
            print(f"  ... and {len(errors) - 50} more", file=sys.stderr)
        sys.exit(1)
    print("OK")


if __name__ == "__main__":
    main()
