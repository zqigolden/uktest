import { useRef } from "react";
import { CHAPTERS } from "../types";
import { loadTests } from "../data";
import { allAttempts, allSessions, readSectionKeys, exportData, importData } from "../db";
import { useAsync, useSetting } from "../hooks";

const DAY_MS = 86_400_000;

export default function Stats() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [shuffleQuestions, setShuffleQuestions] = useSetting("shuffleQuestions", false);
  const [shuffleOptions, setShuffleOptions] = useSetting("shuffleOptions", false);

  async function handleExport() {
    try {
      const data = await exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `uktest-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("导出失败: " + String(err));
    }
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const data = JSON.parse(text);

        if (!data || data.version !== 1 || !data.indexedDb) {
          alert("无效的备份文件！");
          return;
        }

        if (confirm("导入备份将覆盖当前的所有学习进度与设置，确定要继续吗？")) {
          await importData(data);
          alert("导入成功！应用即将刷新。");
          window.location.reload();
        }
      } catch (err) {
        alert("导入失败，文件解析错误: " + String(err));
      }
    };
    reader.readAsText(file);
  }

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

      <div className="card">
        <div style={{ fontWeight: 650, marginBottom: 12 }}>做题设置</div>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>做题时随机打乱题目顺序</span>
          <div className="seg" style={{ width: "120px" }}>
            <button className={shuffleQuestions ? "on" : ""} onClick={() => setShuffleQuestions(true)}>
              开启
            </button>
            <button className={!shuffleQuestions ? "on" : ""} onClick={() => setShuffleQuestions(false)}>
              关闭
            </button>
          </div>
        </div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>做题时随机打乱选项顺序</span>
          <div className="seg" style={{ width: "120px" }}>
            <button className={shuffleOptions ? "on" : ""} onClick={() => setShuffleOptions(true)}>
              开启
            </button>
            <button className={!shuffleOptions ? "on" : ""} onClick={() => setShuffleOptions(false)}>
              关闭
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ fontWeight: 650, marginBottom: 10 }}>数据备份与恢复</div>
        <div className="tiny" style={{ marginBottom: 12 }}>
          导出您的学习进度与设置，或在其他设备/浏览器中导入以同步进度。
        </div>
        <div className="row">
          <button className="btn secondary grow" onClick={handleExport}>
            📤 导出备份
          </button>
          <button className="btn secondary grow" onClick={handleImportClick}>
            📥 导入备份
          </button>
        </div>
        <input
          type="file"
          ref={fileInputRef}
          accept=".json"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />
      </div>
    </div>
  );
}
