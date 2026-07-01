import { useState } from "react";
import { Link } from "react-router-dom";
import type { TestMeta } from "../types";
import { loadTests } from "../data";
import { allSessions } from "../db";
import { useAsync } from "../hooks";

export default function Tests() {
  const [showGeneral, setShowGeneral] = useState(false);
  const d = useAsync(async () => {
    const [tests, sessions] = await Promise.all([loadTests(), allSessions()]);
    const best = new Map<string, number>();
    for (const s of sessions) {
      const pct = Math.round((s.score / s.total) * 100);
      if (pct > (best.get(s.test) ?? -1)) best.set(s.test, pct);
    }
    const byNum = (a: TestMeta, b: TestMeta) =>
      (a.chapter ?? 1.5) - (b.chapter ?? 1.5) || a.num - b.num;
    return {
      exams: tests.filter((t) => t.kind === "exam").sort((a, b) => a.num - b.num),
      chapters: tests.filter((t) => t.kind === "chapter").sort(byNum),
      general: tests.filter((t) => t.kind === "general").sort((a, b) => a.num - b.num),
      best,
    };
  }, []);

  if (!d) return <div className="empty">加载中…</div>;

  const item = (t: TestMeta) => {
    const best = d.best.get(t.slug);
    return (
      <Link key={t.slug} to={`/quiz/${t.slug}`} className="card tap row">
        <span className="grow">
          <div style={{ fontWeight: 600 }}>{label(t)}</div>
          <div className="tiny">{t.count} 题</div>
        </span>
        {best != null && (
          <span className={`chip ${best >= 75 ? "good" : "bad"}`}>最高 {best}%</span>
        )}
        <span style={{ color: "var(--ink-3)" }}>›</span>
      </Link>
    );
  };

  return (
    <div>
      <div className="topbar">
        <h1>练习测试</h1>
      </div>
      <Link to="/review" className="card tap row">
        <span style={{ fontSize: 20 }}>🔁</span>
        <span className="grow" style={{ fontWeight: 600 }}>
          错题本 · 只练答错的题
        </span>
        <span style={{ color: "var(--ink-3)" }}>›</span>
      </Link>

      <div className="muted" style={{ margin: "16px 2px 8px" }}>
        <b>模拟考试</b> · 主要练习内容，对应网站 Exams 1–17
      </div>
      {d.exams.map(item)}

      <div className="muted" style={{ margin: "16px 2px 8px" }}>
        <b>章节练习</b> · 按手册章节针对性练习
      </div>
      {d.chapters.map(item)}

      <button
        className="btn secondary"
        style={{ margin: "16px 0 10px" }}
        onClick={() => setShowGeneral(!showGeneral)}
      >
        综合测试 {d.general.length} 套（选做）{showGeneral ? " ▴" : " ▾"}
      </button>
      {showGeneral && d.general.map(item)}
    </div>
  );
}

function label(t: TestMeta): string {
  if (t.kind === "exam") return `模拟考试 Exam ${t.num}`;
  if (t.slug === "test-1-2") return "第 1–2 章 · 综合练习";
  if (t.kind === "chapter") return `第 ${t.chapter} 章 · 练习 ${t.num}`;
  return `综合测试 ${t.num}`;
}
