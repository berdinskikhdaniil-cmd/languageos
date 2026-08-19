/**
 * What a learner is asked to talk about.
 *
 * A curated bank rather than a generated prompt. A topic is one sentence that
 * has to be answerable in thirty to ninety seconds by anybody, and a language
 * model is not needed to produce one — spending a request, a second of latency
 * and a failure mode on "Describe your work" would be paying for nothing.
 *
 * **The prompt is in the language being learned, and only that.** A topic is
 * the thing the learner has to speak, so an English learner is asked in
 * English. Everything *around* it — the heading, the buttons, the instruction —
 * follows the interface language. The two are different questions and this file
 * answers only the first.
 *
 * Which is why the bank is keyed by learning language rather than being a flat
 * list. English is the only key today, and `speakingAvailableFor` is what keeps
 * that honest: a Spanish learner is told Speaking is not ready for their
 * language, not handed English prompts in a Spanish course. Adding a language
 * means adding an entry here, not redesigning anything.
 */

export type SpeakingTopic = {
  /**
   * A stable identifier, stored on the attempt. The wording may be improved
   * later; this is what a future "you have answered this before" would match on.
   */
  key: string;
  /** The exact sentence the learner is asked. In the language being learned. */
  prompt: string;
};

const ENGLISH_TOPICS: readonly SpeakingTopic[] = [
  { key: "yesterday", prompt: "Describe what you did yesterday." },
  { key: "place-you-enjoy", prompt: "Tell me about a place you enjoy visiting." },
  { key: "story-you-liked", prompt: "Describe a game, film or book you like, and why." },
  { key: "good-weekend", prompt: "What makes a good weekend for you?" },
  { key: "recently-learned", prompt: "Tell me about something you recently learned." },
  { key: "work-or-studies", prompt: "Describe your work or your studies." },
  { key: "change-your-city", prompt: "What would you change about your city?" },
  { key: "morning-routine", prompt: "Describe an ordinary morning for you, from waking up." },
  { key: "person-you-admire", prompt: "Tell me about someone you admire, and why." },
  { key: "meal-you-cook", prompt: "Describe a meal you know how to cook, and how you make it." },
  { key: "last-trip", prompt: "Tell me about the last trip you took, however short." },
  { key: "how-you-relax", prompt: "What do you do to relax after a difficult day?" },
  { key: "useful-object", prompt: "Describe an object you use every day and could not do without." },
  { key: "something-difficult", prompt: "Tell me about something you found difficult and did anyway." },
  { key: "your-neighbourhood", prompt: "Describe the street or neighbourhood where you live." },
  { key: "advice-you-were-given", prompt: "What is the best advice anyone has given you?" },
  { key: "how-you-started", prompt: "Why did you start learning this language, and how?" },
  { key: "a-good-teacher", prompt: "What makes someone a good teacher, in your opinion?" },
  { key: "plans-this-year", prompt: "What do you want to do before the end of this year?" },
  { key: "technology-you-use", prompt: "Describe an app or a device you use a lot, and what it is for." },
  { key: "a-small-pleasure", prompt: "Tell me about a small thing that reliably makes your day better." },
  { key: "disagreement", prompt: "Describe a time you disagreed with someone, and what happened." },
  { key: "weather-and-seasons", prompt: "Which season do you like most where you live, and why?" },
  { key: "if-you-had-a-day", prompt: "If you had one free day and no obligations, what would you do?" },
];

/**
 * Every learning language Speaking works in, and the topics it asks in.
 *
 * Deliberately not defaulted: `TOPIC_BANK[code]` being undefined is the whole
 * mechanism that stops English prompts leaking into another language's course.
 */
const TOPIC_BANK: Readonly<Record<string, readonly SpeakingTopic[]>> = {
  en: ENGLISH_TOPICS,
};

/**
 * Whether a learner studying this language can practise speaking yet.
 *
 * Speaking needs prompts written *in* the language being learned, and we have
 * them for one language. Saying so plainly is the honest v1: the alternative is
 * asking somebody learning Japanese to answer an English question, which is not
 * a smaller feature but a wrong one.
 */
export function speakingAvailableFor(languageCode: string): boolean {
  return topicsFor(languageCode).length > 0;
}

export function topicsFor(languageCode: string): readonly SpeakingTopic[] {
  return TOPIC_BANK[languageCode.trim().toLowerCase()] ?? [];
}

export function findTopic(languageCode: string, key: string): SpeakingTopic | null {
  return topicsFor(languageCode).find((topic) => topic.key === key) ?? null;
}

/**
 * A topic to answer, chosen without repeating the one on screen.
 *
 * `random` is injected so the choice is testable and so nothing in the render
 * path calls `Math.random()` where a server and a client would disagree about
 * the answer. `exclude` is what makes "another topic" feel like a button rather
 * than a coin toss that lands on the same face.
 */
export function pickTopic(
  languageCode: string,
  { exclude, random = Math.random }: { exclude?: string | null; random?: () => number } = {},
): SpeakingTopic | null {
  const all = topicsFor(languageCode);
  if (all.length === 0) return null;

  const candidates = all.length > 1 && exclude ? all.filter((t) => t.key !== exclude) : all;
  const pool = candidates.length > 0 ? candidates : all;

  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)));
  return pool[index];
}
