# AI Task Allocation

This document is written for LLM consumption. Each model reads its own section as its operating instructions. Cross-model handoffs happen exclusively through the JSON data contracts defined below — never through free-form text.

## Models and Roles

| Model | Role | Cost profile | Use for |
|---|---|---|---|
| **Fable 5** | Architect / Engineer | Expensive — use sparingly, high leverage | Design, all code, schemas, ambiguous decisions, final review |
| **Gemini 3.5 Flash** | Bulk content worker | Cheap, high throughput | Translation, simplification, first-pass tagging — large batches of schema-constrained work |
| **LM Studio (local)** | QA assistant (optional) | Free, slow, limited | Semantic spot-checks on translated content; anything skippable |

### Routing rules

- Code, schemas, architecture, deployment → **always Fable 5**. Never let a cheaper model write or modify code.
- High-volume text transformation with a fixed I/O contract → **always Gemini Flash**. Never spend Fable 5 tokens on bulk translation.
- A Gemini output that fails schema validation twice, or a task requiring judgment (ambiguous mapping, conflicting facts) → **escalate to Fable 5** with the failing item(s) only, not the whole batch.
- Deterministic checks (JSON schema, missing fields, ID integrity) → **plain scripts, no LLM at all**. LLM-based QA is only for semantic quality.

---

## Pipeline Overview

```
Phase 1 (Fable): extraction scripts  →  content.json, questions.json (en fields filled, zh fields null)
Phase 2 (Gemini): enrichment         →  same files, zh / en_simple / linked_content fields filled
Phase 3 (Fable): web app             →  static site consuming the JSON
Phase 4 (scripts + local model): QA  →  validation reports; fixes routed per rules above
Phase 5 (Fable): deploy              →  GitHub Pages
```

Phases 2 and 3 can run in parallel once schemas are frozen.

---

## Data Contracts

All enrichment work operates on these two files. Fields owned by Fable 5 extraction are read-only for every other model.

### `data/content.json` — handbook content units (704 units, GENERATED — schema is live)

```json
{
  "id": "ch3-s07-p010",
  "chapter": 3,
  "section": "3.7",
  "heading": "3.7 Early Britain",
  "subheading": "The Vikings",
  "type": "para",
  "en": "original text — READ-ONLY ('list' units are '• item' lines joined by \\n)",
  "zh": null,
  "en_simple": null,
  "is_exam_point": false,
  "exam_note_zh": null
}
```

For `type: "list"` units the `zh` translation must mirror the `en` structure exactly: same number of lines, each starting with `• `.

### `data/questions.json` — practice questions (2160 questions, GENERATED)

```json
{
  "id": "q-test-3-1-05",
  "source": "https://lifeintheuktestweb.co.uk/test-3-1/",
  "test": "test-3-1",
  "chapter": 3,
  "question_en": "READ-ONLY",
  "question_zh": null,
  "options": [ { "en": "READ-ONLY", "zh": null } ],
  "answer": [1],
  "explanation_en": "READ-ONLY, may be empty",
  "explanation_zh": null,
  "linked_content": []
}
```

`chapter` is null for mixed/general tests. `data/tests.json` (also generated) indexes the 90 test sets with `{slug, title, chapter, kind, count}`.

### `data/glossary.md` — EN→ZH terminology table

Maintained by Fable 5, consumed by Gemini in every translation prompt. Guarantees consistent rendering of recurring terms (e.g. Parliament → 议会, House of Commons → 下议院, jury → 陪审团).

---

## Fable 5 — Architect / Engineer

**Owns:** everything under version control except the `zh` / `en_simple` / `exam_note_zh` / `linked_content` field *values*.

**Status: F1–F6 and F8 are DONE** (2026-07-01). Remaining: F7 review queue (ongoing, as Gemini batches land). Gemini phase (G1–G4) is now unblocked.

Tasks, in order:

1. **F1 — Repo scaffolding**: git init, project structure, static-site framework choice (must build to plain static files for GitHub Pages; mobile-first).
2. **F2 — PDF extraction script** (`scripts/extract_pdf.py`): `document.pdf` → `data/content.json`. Strip page headers/footers (`- N/98 - Crown copyright`), preserve chapter/section hierarchy from the TOC (pages 2–3), split into paragraph-level units with stable IDs. Chapter 6 "Key Material and Facts" gets `is_exam_point: true` seeding.
3. **F3 — Question scraper** (`scripts/scrape_questions.py`): lifeintheuktestweb.co.uk → `data/questions.json`. Rate-limited, cached raw HTML committed to `data/raw/` so the scrape is reproducible without re-hitting the site.
4. **F4 — Schema validator** (`scripts/validate.py`): deterministic checks — schema conformance, no null `en` fields, `answer` indexes in range, `linked_content` IDs exist, untranslated-field counts. Run after every Gemini batch merge.
5. **F5 — Glossary**: seed `data/glossary.md` from the extracted content (proper nouns, institutions, legal terms).
6. **F6 — Web app**: reading view (EN/ZH/simplified toggle, exam-point highlighting), quiz engine (per-chapter + mock exam), study records in IndexedDB, analytics view (accuracy by chapter/topic, wrong-answer review). See CLAUDE.md constraints.
7. **F7 — Review queue**: process items escalated from Gemini/QA; spot-check ~5% of each Gemini batch.
8. **F8 — Deploy**: GitHub Actions workflow → GitHub Pages.

---

## Gemini 3.5 Flash — Bulk Content Worker

**Operating rules (apply to every task):**

- Input is a JSON array of items; output must be the same array, same order, same IDs, valid JSON, **no markdown fences, no commentary**.
- Fill only fields that are `null` in your assigned field set. Never modify `en`, `question_en`, `options[].en`, `explanation_en`, `answer`, or any `id`.
- Use `data/glossary.md` mappings verbatim for listed terms.
- Batch size: 20 content units or 10 questions per request.
- If an item cannot be processed confidently, set the field to `"ESCALATE"` and continue — do not stall the batch, do not guess on factual matters.

**Batch priority order** (user decision 2026-07-01): exam questions first
(`kind: "exam"`, Exams 1–17 — the app's primary practice content), then
chapter tests (`kind: "chapter"`), then general tests (`kind: "general"`,
optional extras in the app). Within content units, chapter 6 (exam summary)
first, then chapters 1–5 in order.

Tasks (parallelizable):

1. **G1 — Translate content** (`zh`): faithful EN→ZH translation of `en`. Register: clear written Chinese for an adult study aid. Keep names of people/places in English on first use with Chinese in parentheses if a standard rendering exists, e.g. `威廉一世（William I）` style per glossary. Do not localize or update dated facts — the test is based on this text as written.
2. **G2 — Translate questions** (`question_zh`, `options[].zh`, `explanation_zh`): same rules. Option translations must remain unambiguous relative to each other.
3. **G3 — Simplify** (`en_simple`): rewrite `en` in plain English at roughly B1 level, ≤60% of original length, preserving every testable fact (names, dates, numbers, sequences). Omit decorative prose only. Set to `null`-equivalent skip (leave null) if the unit is already ≤2 sentences.
4. **G4 — Exam-point mapping first pass** (`linked_content` on questions, `is_exam_point`/`exam_note_zh` on content): for each question, list the content-unit IDs that contain the answer. Mark those units `is_exam_point: true` and write a one-line `exam_note_zh` (e.g. `考点：大宪章签署于1215年`). If no unit clearly contains the answer, output `"ESCALATE"`.

---

## LM Studio Local Model — QA Assistant (optional)

Skippable entirely; deterministic validation (F4) is the required safety net. If used:

1. **L1 — Translation spot-check**: given `{id, en, zh}` pairs, output `{"id": ..., "ok": true/false, "issue": "one line, only if ok=false"}`. Check: meaning preserved, numbers/dates/names match, nothing omitted or invented. Flag, don't fix.
2. **L2 — Simplification fact-check**: given `{id, en, en_simple}`, verify no testable fact (name/date/number) present in `en` is missing from `en_simple`. Same output format as L1.
3. **L3 — Quiz sanity check**: given a question object, verify exactly the `answer` option(s) are correct per `explanation_en` / linked content. Flag mismatches.

All flags go to the Fable 5 review queue (F7). Local model output is advisory only — it never edits data files.

---

## Merge and Escalation Flow

1. Gemini batch output → `scripts/validate.py` → on pass, merge into `data/*.json`; on fail, retry once with the validator error appended to the prompt.
2. Second failure or any `"ESCALATE"` value → Fable 5 review queue.
3. Optional local-model QA runs over merged data; flags → Fable 5 review queue.
4. Fable 5 resolves queue items directly in the data files.
