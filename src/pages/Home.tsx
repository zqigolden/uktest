import { Link } from "react-router-dom";
import { CHAPTERS } from "../types";
import { loadContent, loadTests } from "../data";
import { allSessions, kvGet, readSectionKeys, wrongQuestionIds } from "../db";
import { useAsync } from "../hooks";

interface HomeData {
  sectionTotal: number;
  sectionRead: number;
  testTotal: number;
  testTried: number;
  accuracy: number | null;
  wrongCount: number;
  lastRead: { ch: number; sec: string } | null;
}

async function load(): Promise<HomeData> {
  const [content, tests, readKeys, sessions, wrong, lastRead] = await Promise.all([
    loadContent(),
    loadTests(),
    readSectionKeys(),
    allSessions(),
    wrongQuestionIds(),
    kvGet<{ ch: number; sec: string }>("lastRead"),
  ]);
  const sections = new Set(content.map((u) => `${u.chapter}:${u.section}`));
  // progress metric counts mock exams only; general tests are optional extras
  const exams = tests.filter((t) => t.kind === "exam");
  const tried = new Set(sessions.map((s) => s.test));
  const answered = sessions.reduce((n, s) => n + s.total, 0);
  const correct = sessions.reduce((n, s) => n + s.score, 0);
  return {
    sectionTotal: sections.size,
    sectionRead: readKeys.length,
    testTotal: exams.length,
    testTried: exams.filter((t) => tried.has(t.slug)).length,
    accuracy: answered ? Math.round((correct / answered) * 100) : null,
    wrongCount: wrong.length,
    lastRead: lastRead ?? null,
  };
}

export default function Home() {
  const d = useAsync(load, []);
  return (
    <div>
      <div className="topbar">
        <h1>Life in the UK</h1>
        <span className="chip">中英对照</span>
      </div>

      <div className="card" style={{ background: "var(--navy)", color: "#fff", border: "none" }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>备考进度</div>
        <div style={{ display: "flex", gap: 24, marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800 }}>
              {d ? `${d.sectionRead}/${d.sectionTotal}` : "–"}
            </div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>已读小节</div>
          </div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800 }}>
              {d ? `${d.testTried}/${d.testTotal}` : "–"}
            </div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>已练考试</div>
          </div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800 }}>
              {d?.accuracy != null ? `${d.accuracy}%` : "–"}
            </div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>正确率</div>
          </div>
        </div>
      </div>

      <div className="home-grid">
        <Link
          to={d?.lastRead ? `/read/${d.lastRead.ch}/${d.lastRead.sec}` : "/read"}
          className="card tap"
        >
          <div style={{ fontSize: 22 }}>📖</div>
          <div style={{ fontWeight: 650 }}>继续阅读</div>
          <div className="tiny">
            {d?.lastRead ? `第 ${d.lastRead.ch} 章 · ${d.lastRead.sec}` : "从头开始"}
          </div>
        </Link>
        <Link to="/tests" className="card tap">
          <div style={{ fontSize: 22 }}>✍️</div>
          <div style={{ fontWeight: 650 }}>开始练习</div>
          <div className="tiny">{d ? `${d.testTotal} 套模拟考试` : ""}</div>
        </Link>
        <Link to="/review" className="card tap">
          <div style={{ fontSize: 22 }}>🔁</div>
          <div style={{ fontWeight: 650 }}>错题本</div>
          <div className="tiny">{d ? `${d.wrongCount} 道待复习` : ""}</div>
        </Link>
        <Link to="/stats" className="card tap">
          <div style={{ fontSize: 22 }}>📊</div>
          <div style={{ fontWeight: 650 }}>学习统计</div>
          <div className="tiny">正确率 · 弱项分析</div>
        </Link>
      </div>

      <div className="muted" style={{ margin: "4px 2px 8px", fontWeight: 600 }}>
        手册章节
      </div>
      {CHAPTERS.map((c) => (
        <Link key={c.n} to={`/read/${c.n}`} className="card tap row">
          <span className="chip">{c.n}</span>
          <span className="grow">
            <div style={{ fontWeight: 600 }}>{c.zh}</div>
            <div className="tiny">{c.en}</div>
          </span>
          <span style={{ color: "var(--ink-3)" }}>›</span>
        </Link>
      ))}
    </div>
  );
}
