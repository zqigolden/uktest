import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export interface Attempt {
  qid: string;
  test: string;
  chapter: number | null;
  correct: boolean;
  chosen: number[];
  ts: number;
}

export interface Session {
  test: string;
  ts: number;
  score: number;
  total: number;
}

interface UKTestDB extends DBSchema {
  attempts: {
    key: number;
    value: Attempt;
    indexes: { "by-qid": string; "by-ts": number };
  };
  sessions: {
    key: number;
    value: Session;
    indexes: { "by-test": string };
  };
  kv: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<UKTestDB>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<UKTestDB>("uktest", 1, {
      upgrade(d) {
        const attempts = d.createObjectStore("attempts", { autoIncrement: true });
        attempts.createIndex("by-qid", "qid");
        attempts.createIndex("by-ts", "ts");
        const sessions = d.createObjectStore("sessions", { autoIncrement: true });
        sessions.createIndex("by-test", "test");
        d.createObjectStore("kv");
      },
    });
  }
  return dbPromise;
}

export async function recordAttempt(a: Attempt): Promise<void> {
  await (await db()).add("attempts", a);
}

export async function recordSession(s: Session): Promise<void> {
  await (await db()).add("sessions", s);
}

export async function allAttempts(): Promise<Attempt[]> {
  return (await db()).getAll("attempts");
}

export async function allSessions(): Promise<Session[]> {
  return (await db()).getAll("sessions");
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await (await db()).put("kv", value, key);
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get("kv", key)) as T | undefined;
}

/** Keys of sections marked read: "read:<chapter>:<section>" */
export async function readSectionKeys(): Promise<string[]> {
  const keys = await (await db()).getAllKeys(
    "kv",
    IDBKeyRange.bound("read:", "read:￿"),
  );
  return keys as string[];
}

/** qids whose most recent attempt was wrong. */
export async function wrongQuestionIds(): Promise<string[]> {
  const attempts = await allAttempts();
  const latest = new Map<string, Attempt>();
  for (const a of attempts) {
    const prev = latest.get(a.qid);
    if (!prev || a.ts > prev.ts) latest.set(a.qid, a);
  }
  return [...latest.values()].filter((a) => !a.correct).map((a) => a.qid);
}
