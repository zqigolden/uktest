import { useNavigate } from "react-router-dom";
import QuizRunner from "../components/QuizRunner";
import { loadQuestions } from "../data";
import { wrongQuestionIds } from "../db";
import { useAsync } from "../hooks";

export default function Review() {
  const nav = useNavigate();
  const d = useAsync(async () => {
    const [questions, wrong] = await Promise.all([loadQuestions(), wrongQuestionIds()]);
    const set = new Set(wrong);
    return questions.filter((q) => set.has(q.id));
  }, []);

  if (!d) return <div className="empty">加载中…</div>;

  return (
    <div>
      <div className="topbar">
        <button className="back" onClick={() => nav(-1)}>‹</button>
        <h1>错题本</h1>
        <span className="chip bad">{d.length} 题</span>
      </div>
      {d.length === 0 ? (
        <div className="empty">
          没有待复习的错题 🎉
          <br />
          <span className="tiny">答错的题会自动收集到这里，答对后移除</span>
        </div>
      ) : (
        <QuizRunner questions={d} title="错题复习" />
      )}
    </div>
  );
}
