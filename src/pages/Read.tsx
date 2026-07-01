import { Link } from "react-router-dom";
import { CHAPTERS } from "../types";
import { loadContent } from "../data";
import { readSectionKeys } from "../db";
import { useAsync } from "../hooks";

export default function Read() {
  const d = useAsync(async () => {
    const [content, readKeys] = await Promise.all([loadContent(), readSectionKeys()]);
    const bySections = new Map<number, Set<string>>();
    for (const u of content) {
      if (!bySections.has(u.chapter)) bySections.set(u.chapter, new Set());
      bySections.get(u.chapter)!.add(u.section);
    }
    const read = new Set(readKeys);
    return CHAPTERS.map((c) => {
      const secs = [...(bySections.get(c.n) ?? [])];
      const done = secs.filter((s) => read.has(`read:${c.n}:${s}`)).length;
      return { ...c, total: secs.length, done };
    });
  }, []);

  return (
    <div>
      <div className="topbar">
        <h1>阅读手册</h1>
      </div>
      {(d ?? CHAPTERS.map((c) => ({ ...c, total: 0, done: 0 }))).map((c) => (
        <Link key={c.n} to={`/read/${c.n}`} className="card tap">
          <div className="row">
            <span className="chip">{c.n}</span>
            <span className="grow">
              <div style={{ fontWeight: 600 }}>{c.zh}</div>
              <div className="tiny">{c.en}</div>
            </span>
            <span className="tiny">
              {c.done}/{c.total}
            </span>
          </div>
          <div className="progress-track" style={{ marginTop: 10 }}>
            <div
              className="progress-fill"
              style={{ width: c.total ? `${(c.done / c.total) * 100}%` : "0%" }}
            />
          </div>
        </Link>
      ))}
    </div>
  );
}
