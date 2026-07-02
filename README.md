# Life in the UK — Bilingual Study App

Mobile-first web app for preparing the [Life in the UK Test](https://www.gov.uk/life-in-the-uk-test), combining the official handbook (3rd edition) with 2,160 practice questions, in English with Chinese translations.

**Live**: https://zqigolden.github.io/uktest/

| | |
|---|---|
| 📖 Reading | Full handbook, EN / 中英对照 / 中文 toggle, simplified-English layer, exam-point highlights |
| ✍️ Practice | 17 mock exams (primary), 33 chapter drills, 40 general tests (optional) — instant feedback with explanations |
| 🔁 Mistake book | Auto-collects questions whose latest attempt was wrong; drops them once answered correctly |
| 📊 Analytics | Accuracy by chapter (weak-spot analysis), 14-day activity, session history — all stored locally in the browser |

## Status

**Done**: data pipeline, full app, CI/CD to GitHub Pages. **Handbook translation complete (752/752 units)**; all **17 mock exams fully translated and linked to the handbook** (408 questions).
**Pending / deferred**: chapter & general test translations (deferred — mock exams are the primary practice content), simplified-English layer (3/752). The app degrades to English wherever Chinese is missing. See [Roadmap](#roadmap) and the status table in [AI_TASKS.md](AI_TASKS.md).

## Architecture

Two halves, connected only through committed JSON files. No backend — deployable anywhere static.

```
document.pdf ──▶ scripts/extract_pdf.py ──▶ data/content.json   (752 units)
site HTML   ──▶ scripts/scrape_questions.py ──▶ data/questions.json (2160)
(cached in data/raw/*.html.gz)              └─▶ data/tests.json  (90 sets)
                                                    │
                  scripts/validate.py  ◀── gate ────┤
                                                    ▼
                              src/ (Vite + React + TS) ──▶ GitHub Pages
                              user state → IndexedDB (browser-local)
```

## Decision log

| Decision | Rationale |
|---|---|
| Static-only, no backend | GitHub Pages target; study records live in IndexedDB, content processing happens at build time |
| Custom pdfplumber extraction (not markitdown/pdfminer) | Both were evaluated and produce flat text with broken column order on the two-column pages; heading structure (font-size based) is lost entirely. See "Pipeline details" |
| Keep dated facts (e.g. "as of January 2013") | The real test is based on this edition's text verbatim — "correcting" facts would teach wrong answers |
| Mock exams are the primary practice content | User decision (2026-07-01): site's Exams 1–17 first, chapter drills second, the 40 general tests optional/collapsed |
| Raw scrape HTML committed (gzipped, 6.6 MB) | Reproducible re-parsing without re-hitting the site; parser fixes don't require refetching |
| Multi-model workflow | Fable 5 owns code/schemas; bulk translation goes to a cheaper model under strict JSON contracts — see [AI_TASKS.md](AI_TASKS.md) |
| HashRouter + `base: "./"` | Only combination that needs zero server config under `github.io/<repo>/` |
| Data JSONs as lazy chunks (`src/data.ts` dynamic imports) | questions.json is 1.2 MB minified; it loads only when entering practice pages |
| English original is authoritative | The real test is in English; Chinese is a comprehension aid, never a replacement |

## Pipeline details

### PDF extraction (`scripts/extract_pdf.py`)

The PDF (mkdocs + WeasyPrint output, 98 pages) is parsed by visual layout. Measured constants are documented in the script header. The non-obvious parts:

- **Headings by font**: body is Times 7.8pt; Helvetica sizes map to levels (15.5 chapter / 12.1 section / 9.7 subsection / 7.8 sub-sub / 6.2 small-caps boxes).
- **Two-column regions** (10 pages: 80, 84–85, 88–89, 93–95 in chapter 5, 97–98 in ch. 6.2): naive top-sorted extraction interleaves the columns into garbage. The gutter x-position is detected per page (it varies), then lines are split into *bands*: full-width prose stays in normal flow, maximal runs of column lines are read left column then right. Band boundaries always flush the paragraph buffer, so text never merges across regions (the trade-off: a sentence flowing across a page break inside a column region becomes two units).
- **Re-extraction is enrichment-safe**: translated fields are carried over for units whose English text is unchanged; the script prints how many translated units were dropped. Content ids are **not stable** across extractor changes — `linked_content` in questions.json must then be remapped by matching unit text (id existence is checked by validate.py, semantic correctness is not).
- **Borderless tables** (Commonwealth members 5-column list, population-by-year): detected by anchor voting — recurring segment-start x positions with ≥3 rows having cells in ≥2 columns; a cell must end before the next anchor (this excludes prose that happens to start at an anchor). ≥3 columns → read column-wise (semantic lists); 2 columns → row-wise (`1600 — Just over 4 million`).
- **Noise filtering**: page headers/footers by y-position; image captions = body lines just below an image bbox (images are decorative and dropped).

### Question scraping (`scripts/scrape_questions.py`)

- Everything is in the static HTML: 24 `.container_question` blocks per page and a `const solution = {"p0":"r1",...}` JS blob. No JS execution needed.
- **Gotcha**: option ids are *not* always 0-based — True/False questions use `r1`/`r2`. Answers must be resolved against each option's `data-id_answer`, not by position. (`validate.py` caught this: 30 questions had out-of-range answers before the fix.)
- Test taxonomy from URL slugs: `test-C-M` → chapter drill (test-1-2 covers chapters 1&2 → `chapter: null`), `test-N` → general, everything else → mock exam. Exam slugs are irregular (`british-naturalization-test-10`, `exam-17`, ...) but map to the site's Exams 1–17; the trailing number is the exam ordinal (`num` field).
- Rate-limited (1.5 s); delete `data/raw/` to force a refetch, otherwise re-runs parse from cache instantly.

### Validation (`scripts/validate.py`)

Deterministic gate, run in CI before every build: schema/type conformance, unique ids, non-empty English, answer indexes in range, `linked_content` referential integrity, translation-coverage stats, ESCALATE-marker count. **Run it after any change to `data/*.json`.**

## Web app notes

- `src/db.ts` — IndexedDB stores: `attempts` (per-question), `sessions` (per-test), `kv` (read-section marks `read:<ch>:<sec>`, `lastRead`). The mistake book is derived, not stored: a question is "wrong" iff its most recent attempt is incorrect.
- `src/pages/ReadSection.tsx` — bilingual rendering degrades gracefully: any null `zh`/`en_simple` falls back to the English original; list units pair EN/ZH bullet lines by index and fall back to block rendering on count mismatch. **Enrichment must preserve list line counts** (see AI_TASKS.md).
- Pass mark shown after each test is 75%, matching the real exam (18/24).
- UI prefs (language mode, simplified toggle) persist in localStorage via `useSetting`.

## Development

```bash
npm install
npm run dev        # dev server (localhost:5173)
npm run build      # production build → dist/
npm run typecheck  # tsc --noEmit
npm run extract    # rebuild data/content.json from document.pdf
npm run scrape     # rebuild questions/tests.json (cached; rm -rf data/raw to refetch)
npm run validate   # ALWAYS run after touching data/*.json
```

Python scripts need `pdfplumber`, `requests`, `beautifulsoup4` (validate.py is stdlib-only, which is why CI can run it without pip).

**Deploy**: push to `main` → `.github/workflows/deploy.yml` runs validate → typecheck → build → Pages. No manual steps.

## Roadmap

1. **Finish content enrichment** (per [AI_TASKS.md](AI_TASKS.md) §Gemini, which has the authoritative status table): retranslate the 110 content units invalidated by the extraction fix (mostly sections 5.4–5.8), then question translations for chapter tests (792) and general tests (960), then G4 links for those, then G3 simplified-English rewrites (3/752 done). Terminology must follow [data/glossary.md](data/glossary.md); merge batches only through `validate.py`.
2. **F7 review queue** — spot-check merged batches, resolve `"ESCALATE"` markers. Done so far: fixed chapter-5 column interleaving (2026-07-02), remapped all question links after re-extraction, corrected 31 mislinked questions.
3. **Ideas, unscheduled** — link exam-point highlights to their questions in the reading view (needs G4 complete); per-question stats on the mistake book; PWA manifest for offline/home-screen use; timed exam mode (45 min, like the real test).

## Related docs

- [CLAUDE.md](CLAUDE.md) — working instructions for AI coding sessions in this repo
- [AI_TASKS.md](AI_TASKS.md) — multi-model task allocation, data contracts, merge/escalation flow
- [data/glossary.md](data/glossary.md) — EN→ZH terminology (binding for all translation work)

## Content sources & copyright

Handbook text: *Life in the United Kingdom: A guide for new residents, 3rd Edition* — Crown copyright. Questions: [lifeintheuktestweb.co.uk](https://lifeintheuktestweb.co.uk/). This is a personal, non-commercial study aid.
