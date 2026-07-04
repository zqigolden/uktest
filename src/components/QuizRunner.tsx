import { useState } from "react";
import { Link } from "react-router-dom";
import type { Question } from "../types";
import { recordAttempt, recordSession } from "../db";
import { useSetting } from "../hooks";

interface Props {
  questions: Question[];
  title: string;
  /** session records are skipped for ad-hoc sets like the mistake book */
  sessionSlug?: string;
}

const LETTERS = "ABCDEF";

function same(a: number[], b: number[]) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export default function QuizRunner({ questions, title, sessionSlug }: Props) {
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState<boolean[]>([]);
  const [done, setDone] = useState(false);
  const [mode, setMode] = useSetting<"en" | "both">("quizLangMode", "both");

  if (questions.length === 0) {
    return <div className="empty">没有可用的题目</div>;
  }

  const q = questions[idx];
  const multi = q.answer.length > 1;
  const correctCount = results.filter(Boolean).length;

  function toggle(i: number) {
    if (submitted) return;
    if (multi) {
      setPicked((p) =>
        p.includes(i) ? p.filter((x) => x !== i) : [...p, i].sort((a, b) => a - b),
      );
    } else {
      submit([i]);
    }
  }

  function submit(chosen: number[]) {
    if (submitted || chosen.length === 0) return;
    const correct = same(chosen, q.answer);
    setPicked(chosen);
    setSubmitted(true);
    setResults((r) => [...r, correct]);
    void recordAttempt({
      qid: q.id,
      test: q.test,
      chapter: q.chapter,
      correct,
      chosen,
      ts: Date.now(),
    });
  }

  function next() {
    if (idx + 1 >= questions.length) {
      if (sessionSlug) {
        void recordSession({
          test: sessionSlug,
          ts: Date.now(),
          score: correctCount,
          total: questions.length,
        });
      }
      setDone(true);
    } else {
      setIdx(idx + 1);
      setPicked([]);
      setSubmitted(false);
    }
  }

  if (done) {
    const pct = Math.round((correctCount / questions.length) * 100);
    const passed = pct >= 75; // real test pass mark
    return (
      <div>
        <div className="card result-hero">
          <div className="tiny">{title}</div>
          <div className="score" style={{ color: passed ? "var(--good)" : "var(--bad)" }}>
            {correctCount}/{questions.length}
          </div>
          <div className="muted">
            正确率 {pct}%（真实考试通过线 75%）——{passed ? "通过 ✓" : "未通过"}
          </div>
        </div>
        <Link to="/tests" className="btn secondary" style={{ marginBottom: 10 }}>
          返回练习列表
        </Link>
        <Link to="/review" className="btn secondary">
          去错题本复习
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="seg grow">
          <button className={mode === "both" ? "on" : ""} onClick={() => setMode("both")}>
            中英对照
          </button>
          <button className={mode === "en" ? "on" : ""} onClick={() => setMode("en")}>
            纯英文
          </button>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 8 }}>
        <div className="grow progress-track">
          <div
            className="progress-fill"
            style={{ width: `${(idx / questions.length) * 100}%` }}
          />
        </div>
        <span className="tiny">
          {idx + 1}/{questions.length}
        </span>
      </div>

      <div className="card">
        {multi && <span className="chip">多选题 · 选 {q.answer.length} 项</span>}
        <p style={{ fontWeight: 600, marginBottom: 4 }}>{q.question_en}</p>
        {mode === "both" && q.question_zh && (
          <p className="muted" style={{ marginTop: 0 }}>
            {q.question_zh}
          </p>
        )}
      </div>

      {q.options.map((o, i) => {
        const cls = ["option"];
        if (multi) cls.push("multi");
        if (!submitted && picked.includes(i)) cls.push("picked");
        if (submitted && q.answer.includes(i)) cls.push("correct");
        if (submitted && picked.includes(i) && !q.answer.includes(i)) cls.push("wrong");
        return (
          <button key={i} className={cls.join(" ")} onClick={() => toggle(i)}>
            <span className="mark">{LETTERS[i]}</span>
            <span className="grow">
              {o.en}
              {mode === "both" && o.zh && <span className="t-zh">{o.zh}</span>}
            </span>
          </button>
        );
      })}

      {multi && !submitted && (
        <button
          className="btn"
          disabled={picked.length === 0}
          onClick={() => submit(picked)}
        >
          确认答案
        </button>
      )}

      {submitted && (
        <>
          {(q.explanation_en || (mode === "both" && q.explanation_zh)) && (
            <div className="explanation">
              {q.explanation_en && <div>{q.explanation_en}</div>}
              {mode === "both" && q.explanation_zh && (
                <div style={{ marginTop: 6, color: "var(--ink-2)" }}>{q.explanation_zh}</div>
              )}
            </div>
          )}
          <button className="btn" onClick={next}>
            {idx + 1 >= questions.length ? "查看成绩" : "下一题"}
          </button>
        </>
      )}
    </div>
  );
}
