import { useEffect, useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ContentUnit, LangMode } from "../types";
import { loadSections, type Section } from "../data";
import { kvSet } from "../db";
import { useAsync, useSetting } from "../hooks";

function Unit({ u, mode, simple }: { u: ContentUnit; mode: LangMode; simple: boolean }) {
  const en = simple && u.en_simple ? u.en_simple : u.en;
  const zh = u.zh;
  const showEn = mode !== "zh" || !zh;
  const showZh = mode !== "en" && !!zh;
  const cls = u.is_exam_point ? "unit exam" : "unit";

  const body =
    u.type === "list" ? (
      (() => {
        const enItems = en.split("\n").map((s) => s.replace(/^•\s*/, ""));
        const zhItems = zh ? zh.split("\n").map((s) => s.replace(/^•\s*/, "")) : [];
        const paired = zhItems.length === enItems.length;
        return (
          <>
            <ul>
              {enItems.map((item, i) => (
                <li key={i}>
                  {showEn && <span className="t-en">{item}</span>}
                  {showZh && paired && <span className="t-zh">{zhItems[i]}</span>}
                  {!showEn && !paired && <span className="t-en">{item}</span>}
                </li>
              ))}
            </ul>
            {showZh && !paired && <span className="t-zh">{zh}</span>}
          </>
        );
      })()
    ) : (
      <>
        {showEn && <span className="t-en">{en}</span>}
        {showZh && <span className="t-zh">{zh}</span>}
      </>
    );

  return (
    <div className={cls}>
      {u.is_exam_point && (
        <span className="exam-note">★ 考点{u.exam_note_zh ? ` · ${u.exam_note_zh}` : ""}</span>
      )}
      {body}
      {u.page && (
        <div style={{ marginTop: 4, display: "flex", justifyContent: "flex-end" }}>
          <a
            href={`./document.pdf#page=${u.page}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              color: "var(--ink-3)",
              fontSize: "11px",
              textDecoration: "none",
              background: "var(--line)",
              padding: "2px 6px",
              borderRadius: "4px",
              fontWeight: 500,
            }}
          >
            📄 PDF p. {u.page}
          </a>
        </div>
      )}
    </div>
  );
}

export default function ReadSection() {
  const { ch, sec } = useParams();
  const nav = useNavigate();
  const chapter = Number(ch);

  const sections = useAsync(() => loadSections(chapter), [chapter]);
  const [mode, setMode] = useSetting<LangMode>("langMode", "both");
  const [simple, setSimple] = useSetting("simpleEnglish", false);

  const current: Section | undefined = useMemo(
    () => sections?.find((s) => s.section === sec),
    [sections, sec],
  );
  const idx = sections && current ? sections.indexOf(current) : -1;
  const prev = idx > 0 ? sections![idx - 1] : null;
  const next = idx >= 0 && idx + 1 < (sections?.length ?? 0) ? sections![idx + 1] : null;

  useEffect(() => {
    if (sec) void kvSet("lastRead", { ch: chapter, sec });
    window.scrollTo(0, 0);
  }, [chapter, sec]);

  if (!sections) return <div className="empty">加载中…</div>;
  if (!current) return <div className="empty">未找到该小节</div>;

  const hasSimple = current.units.some((u) => u.en_simple);
  let lastSub: string | null = null;

  return (
    <div>
      <div className="topbar">
        <button className="back" onClick={() => nav(`/read/${chapter}`)}>‹</button>
        <h1 style={{ fontSize: 17 }}>{current.title}</h1>
      </div>

      <div className="read-tools">
        <div className="seg grow">
          {(["en", "both", "zh"] as LangMode[]).map((m) => (
            <button key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>
              {m === "en" ? "English" : m === "both" ? "中英对照" : "中文"}
            </button>
          ))}
        </div>
        {hasSimple && (
          <div className="seg">
            <button className={simple ? "on" : ""} onClick={() => setSimple(!simple)}>
              简化版
            </button>
          </div>
        )}
      </div>

      {current.units.map((u) => {
        const showSub = u.subheading && u.subheading !== lastSub;
        lastSub = u.subheading;
        return (
          <div key={u.id}>
            {showSub && <div className="subheading">{u.subheading}</div>}
            <Unit u={u} mode={mode} simple={simple} />
          </div>
        );
      })}

      <button
        className="btn"
        style={{ margin: "18px 0 10px" }}
        onClick={async () => {
          await kvSet(`read:${chapter}:${current.section}`, Date.now());
          if (next) nav(`/read/${chapter}/${next.section}`);
          else nav(`/read/${chapter}`);
        }}
      >
        标记已读{next ? " · 下一节" : " · 返回目录"}
      </button>

      <div className="row">
        {prev && (
          <Link to={`/read/${chapter}/${prev.section}`} className="btn secondary">
            ‹ {prev.section}
          </Link>
        )}
        {next && (
          <Link to={`/read/${chapter}/${next.section}`} className="btn secondary">
            {next.section} ›
          </Link>
        )}
      </div>
    </div>
  );
}
