#!/usr/bin/env python3
"""Extract document.pdf (Life in the UK handbook, 3rd ed.) into data/content.json.

Layout facts (measured with pdfplumber; markitdown/pdfminer were evaluated and
produce flat text with broken column order, so we parse layout ourselves):
- Body text: Times-New-Roman 7.8pt. Headings: Helvetica-Neue-Light.
  H1 chapter ~15.5, H2 section ~12.1, H3 subsection ~9.7, H4 ~7.8, small-caps box ~6.2.
- Page header (repeats section title) sits at top<45; footer "- N/98 -" at top>795.
- Line spacing within a paragraph ~12.5pt; paragraph gap >=16pt.
- Bullet glyphs come out of stream order -> words must be sorted by (top, x0).
- Image captions are body-font lines sitting just below an image bbox (images
  themselves are not extracted; they are decorative).
- Pages 97-98 (ch6.2 Key Material and Facts) are two-column pages: words are
  split at the x~310 whitespace channel and read left column then right column.
- Borderless tables (Commonwealth members p90, population table) are detected
  by anchor voting: >=2 recurring segment-start x positions, >=3 rows having
  cells in >=2 columns. 3+ column tables read column-wise (they are semantic
  column lists), 2-column tables read row-wise ("cell1 — cell2").
- Pages 1-3 are cover + table of contents; content starts on page 4.
"""

import json
import re
from collections import Counter
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "document.pdf"
OUT = ROOT / "data" / "content.json"

HEADER_TOP = 45
FOOTER_TOP = 795
PARA_GAP = 16
LINE_GROUP_TOL = 3
CAPTION_BELOW_IMAGE = 25
SEG_GAP = 14          # min horizontal gap that separates table cells
INK_BRIDGE = 6        # bridge inter-word spaces when merging ink runs
ANCHOR_TOL = 4        # x tolerance for matching a segment start to an anchor
COL_CHANNEL = (300, 320)   # x zone of the two-column page gutter
COL_CLEAR_FRAC = 0.85      # fraction of lines that must be clear of the gutter
COL_MIN_BOTH = 5           # lines with ink on both sides of the gutter

TERMINAL = tuple(".!?:;”’)")


def classify(size: float, font: str) -> str:
    if "Helvetica" not in font:
        return "body"
    if size >= 14:
        return "h1"
    if size >= 11:
        return "h2"
    if size >= 9:
        return "h3"
    if size >= 7.5:
        return "h4"
    return "box"  # small-caps group/bio headings


def group_lines(words):
    """Group words (sorted) into visual lines."""
    words = sorted(words, key=lambda w: (round(w["top"] / LINE_GROUP_TOL), w["x0"]))
    lines, cur, cur_top = [], [], None
    for w in words:
        if cur_top is None or abs(w["top"] - cur_top) < LINE_GROUP_TOL:
            cur.append(w)
            cur_top = w["top"]
        else:
            lines.append(cur)
            cur, cur_top = [w], w["top"]
    if cur:
        lines.append(cur)
    return lines


def build_lines(words, img_bottoms):
    """Filtered, classified lines: dicts with top/x0/kind/text/words."""
    out = []
    for ln in group_lines(words):
        top = ln[0]["top"]
        if any(-2 <= top - b <= CAPTION_BELOW_IMAGE for b in img_bottoms):
            continue  # image caption / alt text
        size = max(x["size"] for x in ln)
        font = max(ln, key=lambda x: x["size"])["fontname"]
        text = " ".join(x["text"] for x in ln).strip()
        if text:
            out.append(
                {
                    "top": top,
                    "x0": ln[0]["x0"],
                    "kind": classify(size, font),
                    "text": text,
                    "words": ln,
                }
            )
    return out


def two_column_split(words):
    """Return [preamble, left, right] word groups if the page is two-column.

    Full-width lines above the column region (e.g. an intro paragraph) must
    not be chopped at the gutter, so everything above the first fully-right
    line is processed as normal flow.
    """
    lo, hi = COL_CHANNEL
    lines = group_lines(words)
    if not lines:
        return None
    clear = both = 0
    for ln in lines:
        crossing = any(w["x0"] < hi and w["x1"] > lo for w in ln)
        if not crossing:
            clear += 1
            if min(w["x0"] for w in ln) < lo and max(w["x1"] for w in ln) > hi:
                both += 1
    if clear / len(lines) < COL_CLEAR_FRAC or both < COL_MIN_BOTH:
        return None
    mid = (lo + hi) / 2
    right_tops = [
        ln[0]["top"] for ln in lines if all(w["x0"] >= mid for w in ln)
    ]
    col_top = min(right_tops) - LINE_GROUP_TOL if right_tops else 0
    pre = [w for w in words if w["top"] < col_top]
    left = [w for w in words if w["top"] >= col_top and w["x0"] < mid]
    right = [w for w in words if w["top"] >= col_top and w["x0"] >= mid]
    return [pre, left, right]


def segments(line):
    """(x0, x1) of each ink run in the line, splitting at gaps >= SEG_GAP."""
    runs, prev_x1 = [], None
    for w in line["words"]:
        if prev_x1 is None or w["x0"] - prev_x1 >= SEG_GAP:
            runs.append([w["x0"], w["x1"]])
        else:
            runs[-1][1] = max(runs[-1][1], w["x1"])
        prev_x1 = max(prev_x1 or 0, w["x1"])
    return runs


def line_is_table_row(line, anchors):
    """Every cell starts on an anchor and ends before the next anchor."""
    for s, e in segments(line):
        if min(abs(s - a) for a in anchors) > ANCHOR_TOL:
            return False
        i = anchor_index(s, anchors)
        if i + 1 < len(anchors) and e >= anchors[i + 1] - ANCHOR_TOL:
            return False  # text flows across the next column: prose, not a cell
    return True


def detect_table(block):
    """Return (anchors, per-line row flags) if the block contains a table."""
    if len(block) < 3:
        return None
    votes = Counter()
    for ln in block:
        for s, _ in segments(ln):
            votes[round(s / 3) * 3] += 1
    anchors = sorted(b for b, v in votes.items() if v >= 3)
    merged = []
    for a in anchors:
        if merged and a - merged[-1] <= ANCHOR_TOL:
            continue
        merged.append(a)
    if len(merged) < 2:
        return None
    flags = [line_is_table_row(ln, merged) for ln in block]
    multi = sum(
        1 for ln, ok in zip(block, flags) if ok and len(segments(ln)) >= 2
    )
    if multi < 3:
        return None
    return merged, flags


def anchor_index(x0, anchors):
    best = 0
    for i, a in enumerate(anchors):
        if x0 >= a - ANCHOR_TOL:
            best = i
    return best


class Builder:
    def __init__(self):
        self.units = []
        self.chapter = 0
        self.section = ""  # e.g. "1.2"
        self.heading = ""  # nearest h2/h3 text
        self.subheading = None  # nearest h4/box text, reset on new section
        self.seq = 0
        self.buf = []  # pending paragraph lines
        self.buf_type = "para"  # para | list
        self.tables = 0

    def sec_slug(self) -> str:
        # "5.4.1" -> "s04" (minor of the owning h2 section), "1.2" -> "s02"
        parts = self.section.split(".")
        minor = parts[1] if len(parts) > 1 else "0"
        return f"s{int(minor):02d}"

    def emit(self, text: str, unit_type: str):
        text = text.strip()
        if not text or text == "•":
            return
        self.seq += 1
        self.units.append(
            {
                "id": f"ch{self.chapter}-{self.sec_slug()}-p{self.seq:03d}",
                "chapter": self.chapter,
                "section": self.section,
                "heading": self.heading,
                "subheading": self.subheading,
                "type": unit_type,
                "en": text,
                "zh": None,
                "en_simple": None,
                "is_exam_point": self.chapter == 6,
                "exam_note_zh": None,
            }
        )

    def flush(self):
        if not self.buf:
            return
        if self.buf_type == "list":
            items = [i for i in self.buf if i.strip("• ").strip()]
            text = "\n".join(items)
        else:
            text = re.sub(r"\s+", " ", " ".join(self.buf))
        self.emit(text, self.buf_type)
        self.buf, self.buf_type = [], "para"

    def on_heading(self, kind: str, text: str):
        self.flush()
        if kind == "h1":
            m = re.match(r"^(\d+)\.\s", text)
            if m:
                self.chapter = int(m.group(1))
            self.section = f"{self.chapter}.0"
            self.heading = text
            self.subheading = None
            self.seq = 0
        elif kind in ("h2", "h3"):
            m = re.match(r"^(\d+(?:\.\d+)+)\s+(.*)", text)
            if m:
                self.section = m.group(1)
            self.heading = text
            self.subheading = None
            if kind == "h2":
                self.seq = 0
        else:  # h4 / box
            self.subheading = text

    def on_body(self, line, gap_from_prev: float | None, flow_break: bool):
        text = line["text"]
        if text.startswith("•"):
            if self.buf_type != "list":
                self.flush()
                self.buf_type = "list"
            self.buf.append(re.sub(r"^•\s*", "• ", text))
            return
        if self.buf_type == "list":
            # indented continuation of the previous bullet item
            if gap_from_prev is not None and gap_from_prev < PARA_GAP and line["x0"] > 50:
                self.buf[-1] += " " + text
                return
            if not (flow_break and self.buf and not self.buf[-1].endswith(TERMINAL)):
                self.flush()
        if flow_break:
            # continue across a page/column break only if it looks unfinished
            if self.buf and self.buf[-1].endswith(TERMINAL):
                self.flush()
        elif gap_from_prev is not None and gap_from_prev >= PARA_GAP:
            self.flush()
        if self.buf_type == "list":
            self.buf[-1] += " " + text
        else:
            self.buf.append(text)

    def on_table(self, rows, anchors):
        self.flush()
        self.tables += 1
        grid = []
        for ln in rows:
            row = [[] for _ in anchors]
            for w in ln["words"]:
                row[anchor_index(w["x0"], anchors)].append(w["text"])
            grid.append([" ".join(c).strip() for c in row])
        # drop columns with no content in any row (anchors owned by prose lines)
        used = [ci for ci in range(len(anchors)) if any(r[ci] for r in grid)]
        grid = [[r[ci] for ci in used] for r in grid]
        anchors = [anchors[ci] for ci in used]
        if len(anchors) >= 3:  # semantic column lists (e.g. Commonwealth members)
            header, body_rows = grid[0], grid[1:]
            for ci in range(len(anchors)):
                items = [r[ci] for r in body_rows if r[ci]]
                if not items:
                    continue
                title = header[ci]
                body = "\n".join(f"• {i}" for i in items)
                self.emit(f"{title}\n{body}" if title else body, "list")
        else:  # row-wise key/value table (e.g. population by year)
            items = [" — ".join(c for c in r if c) for r in grid]
            self.emit("\n".join(f"• {i}" for i in items if i), "list")

    def process(self, lines, flow_break_first: bool):
        """Feed one column/page worth of classified lines through the builder."""
        i, prev_top, pending_break = 0, None, flow_break_first
        while i < len(lines):
            if lines[i]["kind"] != "body":
                self.on_heading(lines[i]["kind"], lines[i]["text"])
                prev_top = lines[i]["top"]
                pending_break = False
                i += 1
                continue
            j = i
            while j < len(lines) and lines[j]["kind"] == "body":
                j += 1
            block = lines[i:j]
            table = detect_table(block)
            if table:
                anchors, flags = table
                k = 0
                while k < len(block):
                    if flags[k]:
                        r = k
                        while r < len(block) and flags[r]:
                            r += 1
                        self.on_table(block[k:r], anchors)
                        prev_top, pending_break = block[r - 1]["top"], False
                        k = r
                    else:
                        gap = None if prev_top is None else block[k]["top"] - prev_top
                        self.on_body(block[k], gap, pending_break)
                        prev_top, pending_break = block[k]["top"], False
                        k += 1
            else:
                for line in block:
                    gap = None if prev_top is None else line["top"] - prev_top
                    self.on_body(line, gap, pending_break)
                    prev_top, pending_break = line["top"], False
            i = j


def main():
    b = Builder()
    two_col_pages = []
    with pdfplumber.open(PDF) as pdf:
        for pageno, page in enumerate(pdf.pages, start=1):
            if pageno <= 3:
                continue
            words = [
                w
                for w in page.extract_words(extra_attrs=["size", "fontname"])
                if HEADER_TOP <= w["top"] <= FOOTER_TOP
            ]
            img_bottoms = [img["bottom"] for img in page.images]
            split = two_column_split(words)
            if split:
                two_col_pages.append(pageno)
            for col_words in split if split else [words]:
                b.process(build_lines(col_words, img_bottoms), flow_break_first=True)
    b.flush()

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(b.units, ensure_ascii=False, indent=1), encoding="utf-8")

    chapters = {}
    for u in b.units:
        chapters[u["chapter"]] = chapters.get(u["chapter"], 0) + 1
    print(
        f"wrote {len(b.units)} units to {OUT.relative_to(ROOT)} "
        f"({b.tables} tables, two-col pages: {two_col_pages})"
    )
    for ch in sorted(chapters):
        print(f"  chapter {ch}: {chapters[ch]} units")


if __name__ == "__main__":
    main()
