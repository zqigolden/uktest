# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Goal

A mobile-first, Chinese-English bilingual web app for studying and practicing the Life in the UK Test. It combines:

- **Study material**: `document.pdf` — the official handbook *"Life in the United Kingdom: A guide for new residents, 3rd Edition"* (98 pages, Crown copyright).
- **Practice questions**: scraped/collected from https://lifeintheuktestweb.co.uk/

Core features to build:

1. Bilingual (EN/ZH) reading view of the handbook, optimized for mobile screens.
2. Practice tests with per-question and per-topic tracking.
3. Study-record persistence and analytics (progress, weak areas, wrong-answer review).
4. Simplified/condensed versions of the material, with likely exam points highlighted and cross-linked to actual questions.

## Multi-Model Workflow

Work is split across several AI models (architecture/code vs. bulk translation vs. QA). See `AI_TASKS.md` for the task allocation, data contracts, and escalation rules. Claude (Fable 5) owns all code and schemas; bulk content enrichment is done by cheaper models against the JSON contracts defined there.

## Commands

```
npm run dev        # Vite dev server (or preview_start with .claude/launch.json "dev")
npm run build      # production build to dist/
npm run typecheck  # tsc --noEmit
npm run extract    # re-extract data/content.json from document.pdf
npm run scrape     # re-scrape questions (uses gzipped cache in data/raw/; delete to refetch)
npm run validate   # deterministic data validation — run after ANY change to data/*.json
```

No test suite yet; `typecheck` + `validate` are the CI gates (see `.github/workflows/deploy.yml`, which deploys to GitHub Pages on push to main).

## Architecture

Two halves, connected only through `data/*.json`:

1. **Python pipeline** (`scripts/`): `extract_pdf.py` parses the PDF's visual layout with pdfplumber (font-size heading classification, per-page gutter detection + band-based two-column handling on 10 mixed-layout pages, borderless-table detection — the header comments document the measured layout constants; markitdown/pdfminer were evaluated and produce broken column order, don't switch back). `scrape_questions.py` parses cached HTML (answers live in a `const solution` JS blob; option ids are NOT always 0-based — True/False questions use r1/r2, resolve via `data-id_answer`).

   **Re-extraction safety**: `extract_pdf.py` carries `zh`/`en_simple`/`exam_note_zh` over from the existing content.json for units whose English text is unchanged (matched by id, then by unique `en`). Units whose text changed lose enrichment and must be retranslated. Content **ids are NOT stable** across extraction changes (they encode per-section sequence): after any re-extraction, `questions.json` `linked_content` must be remapped by matching old→new unit English text, then spot-checked semantically — id-existence alone is not enough (validate.py only checks existence).
2. **React app** (`src/`): Vite + React + TS, HashRouter + `base: "./"` (both required for GitHub Pages). Data JSONs are dynamic-imported in `src/data.ts` so they become lazy chunks. All user state (attempts, sessions, read-section marks, `lastRead`) lives in IndexedDB via `src/db.ts`; UI prefs in localStorage via `useSetting`. The wrong-answer book is derived: a question is "wrong" iff its most recent attempt is incorrect.

Bilingual rendering rule (`src/pages/ReadSection.tsx`): `zh`/`en_simple` fields may be null (enrichment pending) and every view must degrade to English original; list units pair EN/ZH bullet lines by index and fall back to block rendering on count mismatch.

## Architecture Constraints (decided up front)

- **Static deployment target**: the app should deploy to GitHub Pages (github.io). Therefore: no backend server. All study records must be stored client-side (localStorage or IndexedDB). Any content processing (PDF extraction, translation, question scraping) happens at build time or as one-off scripts, producing static JSON/Markdown assets that the app loads.
- **Mobile-first**: design for narrow viewports first; the primary use case is reading/practicing on a phone.
- **Content pipeline as data, not runtime**: extract the handbook into structured data (chapters → sections → paragraphs) once, then enrich it (Chinese translation, simplification, exam-point highlights) as separate fields on the same structure, so the reading view can toggle between EN / ZH / simplified layers.

## Content Source Notes

### document.pdf

- Text-based PDF (not scanned) — `pypdf` extracts text cleanly. Generated from mkdocs via WeasyPrint, so text flow is clean but page headers/footers ("- N/98 - Crown copyright") need stripping.
- Table of contents is on pages 2–3. Chapters:
  1. The values and principles of the UK
  2. What is the UK?
  3. A long and illustrious history
  4. A modern, thriving society
  5. The UK government, the law and your role
  6. Summary (Sources; Key Material and Facts)
- Chapter 6 ("Key Material and Facts") is already a condensed summary — useful seed for the simplified/exam-point layer.
- The material contains dated facts (e.g. "as of January 2013") that the real test still uses — do not "correct" them when simplifying; the test is based on this edition's text.

### lifeintheuktestweb.co.uk

- Scraped (2,160 questions / 90 test sets, raw HTML cached in `data/raw/*.html.gz`). The site's Exams 1–17 are the app's primary practice content; general tests are optional extras. English question text is kept verbatim; Chinese translations are separate fields.

### Enrichment working files

- `scratch/` (gitignored) holds translation batch chunks produced by the Gemini-side tooling. Never read it as a source of truth — the canonical state is only `data/*.json`.

## Conventions

- Everything in the repository (code, comments, docs, commit messages, filenames) is in **English**. Chinese appears only as *content data* (translations shown in the app UI).
- App UI is bilingual: English original is authoritative (the real test is in English); Chinese is a comprehension aid, not a replacement.
