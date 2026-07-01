import { Link, useNavigate, useParams } from "react-router-dom";
import { CHAPTERS } from "../types";
import { loadSections } from "../data";
import { readSectionKeys } from "../db";
import { useAsync } from "../hooks";

export default function ReadChapter() {
  const { ch } = useParams();
  const nav = useNavigate();
  const chapter = Number(ch);
  const meta = CHAPTERS.find((c) => c.n === chapter);

  const d = useAsync(async () => {
    const [sections, readKeys] = await Promise.all([
      loadSections(chapter),
      readSectionKeys(),
    ]);
    const read = new Set(readKeys);
    return sections.map((s) => ({
      ...s,
      done: read.has(`read:${chapter}:${s.section}`),
    }));
  }, [chapter]);

  return (
    <div>
      <div className="topbar">
        <button className="back" onClick={() => nav(-1)}>‹</button>
        <h1>
          第 {chapter} 章 · {meta?.zh}
        </h1>
      </div>
      {d?.map((s) => (
        <Link
          key={s.section}
          to={`/read/${chapter}/${s.section}`}
          className="card tap row"
        >
          <span className="grow">
            <div style={{ fontWeight: 600 }}>{s.title}</div>
            <div className="tiny">{s.units.length} 段</div>
          </span>
          {s.done ? <span className="chip good">已读 ✓</span> : <span style={{ color: "var(--ink-3)" }}>›</span>}
        </Link>
      ))}
    </div>
  );
}
