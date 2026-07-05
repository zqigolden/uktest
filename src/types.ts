export interface ContentUnit {
  id: string;
  chapter: number;
  section: string;
  heading: string;
  subheading: string | null;
  type: "para" | "list";
  en: string;
  zh: string | null;
  en_simple: string | null;
  is_exam_point: boolean;
  exam_note_zh: string | null;
  page?: number;
}

export interface QuestionOption {
  en: string;
  zh: string | null;
}

export interface Question {
  id: string;
  source: string;
  test: string;
  chapter: number | null;
  question_en: string;
  question_zh: string | null;
  options: QuestionOption[];
  answer: number[];
  explanation_en: string;
  explanation_zh: string | null;
  linked_content: string[];
}

export interface TestMeta {
  slug: string;
  title: string;
  chapter: number | null;
  kind: "chapter" | "general" | "exam";
  num: number;
  count: number;
}

export type LangMode = "en" | "both" | "zh";

export interface ChapterMeta {
  n: number;
  en: string;
  zh: string;
}

export const CHAPTERS: ChapterMeta[] = [
  { n: 1, en: "The values and principles of the UK", zh: "英国的价值观与原则" },
  { n: 2, en: "What is the UK?", zh: "什么是英国" },
  { n: 3, en: "A long and illustrious history", zh: "悠久辉煌的历史" },
  { n: 4, en: "A modern, thriving society", zh: "现代繁荣的社会" },
  { n: 5, en: "The UK government, the law and your role", zh: "英国政府、法律与你的角色" },
  { n: 6, en: "Summary: key material and facts", zh: "总结：核心材料与考点" },
];
