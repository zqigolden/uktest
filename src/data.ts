import type { ContentUnit, Question, TestMeta } from "./types";

// Data files are dynamic imports so Vite code-splits them into lazy chunks;
// nothing loads until a page actually needs it.

let content: ContentUnit[] | null = null;
let questions: Question[] | null = null;
let tests: TestMeta[] | null = null;

export async function loadContent(): Promise<ContentUnit[]> {
  if (!content) {
    content = (await import("../data/content.json")).default as unknown as ContentUnit[];
  }
  return content;
}

export async function loadQuestions(): Promise<Question[]> {
  if (!questions) {
    questions = (await import("../data/questions.json")).default as unknown as Question[];
  }
  return questions;
}

export async function loadTests(): Promise<TestMeta[]> {
  if (!tests) {
    tests = (await import("../data/tests.json")).default as unknown as TestMeta[];
  }
  return tests;
}

export interface Section {
  chapter: number;
  section: string;
  title: string;
  units: ContentUnit[];
}

export async function loadSections(chapter: number): Promise<Section[]> {
  const all = await loadContent();
  const sections: Section[] = [];
  const index = new Map<string, Section>();
  for (const u of all) {
    if (u.chapter !== chapter) continue;
    let s = index.get(u.section);
    if (!s) {
      s = { chapter, section: u.section, title: u.heading, units: [] };
      index.set(u.section, s);
      sections.push(s);
    }
    s.units.push(u);
  }
  return sections;
}
