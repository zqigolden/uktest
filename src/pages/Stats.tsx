import { CHAPTERS } from "../types";
import { loadTests } from "../data";
import { allAttempts, allSessions, readSectionKeys } from "../db";
import { useAsync } from "../hooks";

const DAY_MS = 86_400_000;

export default function Stats() {
  const d = useAsync(async () => {
    const [attempts, sessions, readKeys, tests] = await Promise.all([
      allAttempts(),
      allSessions(),
      readSectionKeys(),
      loadTests(),
    ]);

    // per-chapter accuracy (chapter tagged on the attempt; null = mixed tests)
    const byChapter = new Map<number | null, { ok: number; n: number }>();
    for (const a of attempts) {
      const key = a.chapter;
      const c = byChapter.get(key) ?? { ok: 0, n: 0 };
      c.n += 1;
      if (a.correct) c.ok += 1;
      byChapter.set(key, c);
    }

    // daily activity, last 14 days
    const today = Math.floor(Date.now() / DAY_MS);
    const daily = new Array(14).fill(0);
    for (const a of attempts) {
      const diff = today - Math.floor(a.ts / DAY_MS);
      if (diff >= 0 && diff < 14) daily[13 - diff] += 1;
    }

    const titles = new Map(tests.map((t) => [t.slug, t.title]));
    const recent = [...sessions].sort((a, b) => b.ts - a.ts).slice(0, 10);

    return {
      total: attempts.length,
      correct: attempts.filter((a) => a.correct).length,
      readCount: readKeys.length,
      byChapter,
      daily,
      recent,
      titles,
    };
  }, []);

  if (!d) return <div className="empty">加载中…</div>;
  const acc = d.total ? Math.round((d.correct / d.total) * 100) : null;

  return (
    <div>
      <div className="topbar">
        <h1>学习统计</h1>
      </div>

      <div className="stat-grid">
        <div className="card">
          <div className="num">{d.total}</div>
          <div className="tiny">累计答题</div>
        </div>
        <div className="card">
          <div className="num">{acc != null ? `${acc}%` : "–"}</div>
          <div className="tiny">总正确率</div>
        </div>
        <div className="card">
          <div className="num">{d.readCount}</div>
          <div className="tiny">已读小节</div>
        </div>
      </div>

      <div className="card">
        <div style={{ fontWeight: 650, marginBottom: 10 }}>近 14 天答题量</div>
        <div className="spark">
          {d.daily.map((n, i) => (
            <div
              key={i}
              className="bar"
              style={{ height: `${Math.min(100, (n / Math.max(...d.daily, 1)) * 100)}%` }}
              title={`${n} 题`}
            />
          ))}
        </div>
      </div>

      <div className="card">
        <div style={{ fontWeight: 650, marginBottom: 10 }}>各章正确率（弱项分析）</div>
        {d.total === 0 && <div className="tiny">还没有答题记录</div>}
        {[...CHAPTERS.map((c) => c.n as number | null), null].map((ch) => {
          const s = d.byChapter.get(ch);
          if (!s) return null;
          const pct = Math.round((s.ok / s.n) * 100);
          const meta = CHAPTERS.find((c) => c.n === ch);
          return (
            <div key={String(ch)} className="bar-row">
              <span className="label">{meta ? `第 ${ch} 章` : "综合题"}</span>
              <div className="grow progress-track">
                <div
                  className="progress-fill"
                  style={{
                    width: `${pct}%`,
                    background: pct >= 75 ? "var(--good)" : "var(--bad)",
                  }}
                />
              </div>
              <span className="val">
                {pct}% · {s.n}题
              </span>
            </div>
          );
        })}
      </div>

      <div className="card">
        <div style={{ fontWeight: 650, marginBottom: 10 }}>最近测试</div>
        {d.recent.length === 0 && <div className="tiny">还没有完成过整套测试</div>}
        {d.recent.map((s, i) => {
          const pct = Math.round((s.score / s.total) * 100);
          return (
            <div key={i} className="row" style={{ marginBottom: 8 }}>
              <span className="grow" style={{ fontSize: 14 }}>
                {d.titles.get(s.test) ?? s.test}
                <div className="tiny">{new Date(s.ts).toLocaleDateString("zh-CN")}</div>
              </span>
              <span className={`chip ${pct >= 75 ? "good" : "bad"}`}>
                {s.score}/{s.total}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
