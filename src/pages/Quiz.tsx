import { useNavigate, useParams } from "react-router-dom";
import QuizRunner from "../components/QuizRunner";
import { loadQuestions, loadTests } from "../data";
import { useAsync } from "../hooks";

export default function Quiz() {
  const { slug } = useParams();
  const nav = useNavigate();

  const d = useAsync(async () => {
    const [questions, tests] = await Promise.all([loadQuestions(), loadTests()]);
    return {
      questions: questions.filter((q) => q.test === slug),
      meta: tests.find((t) => t.slug === slug),
    };
  }, [slug]);

  if (!d) return <div className="empty">加载中…</div>;

  return (
    <div>
      <div className="topbar">
        <button className="back" onClick={() => nav("/tests")}>‹</button>
        <h1 style={{ fontSize: 16 }}>{d.meta?.title ?? slug}</h1>
      </div>
      <QuizRunner
        questions={d.questions}
        title={d.meta?.title ?? slug ?? ""}
        sessionSlug={slug}
      />
    </div>
  );
}
