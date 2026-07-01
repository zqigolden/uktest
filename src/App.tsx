import { HashRouter, NavLink, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Read from "./pages/Read";
import ReadChapter from "./pages/ReadChapter";
import ReadSection from "./pages/ReadSection";
import Tests from "./pages/Tests";
import Quiz from "./pages/Quiz";
import Review from "./pages/Review";
import Stats from "./pages/Stats";

const TABS = [
  { to: "/", icon: "⌂", label: "首页" },
  { to: "/read", icon: "📖", label: "阅读" },
  { to: "/tests", icon: "✍️", label: "练习" },
  { to: "/stats", icon: "📊", label: "统计" },
];

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/read" element={<Read />} />
        <Route path="/read/:ch" element={<ReadChapter />} />
        <Route path="/read/:ch/:sec" element={<ReadSection />} />
        <Route path="/tests" element={<Tests />} />
        <Route path="/quiz/:slug" element={<Quiz />} />
        <Route path="/review" element={<Review />} />
        <Route path="/stats" element={<Stats />} />
      </Routes>
      <nav className="bottom-nav">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === "/"}
            className={({ isActive }) => (isActive ? "active" : "")}>
            <span className="icon">{t.icon}</span>
            {t.label}
          </NavLink>
        ))}
      </nav>
    </HashRouter>
  );
}
