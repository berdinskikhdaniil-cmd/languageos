/**
 * Stand-in for the signed-in learner. Replaced by verified Telegram `initData`
 * once authentication lands; the shape is what the header needs either way.
 */
export const MOCK_USER = {
  initials: "DB",
  /** The language currently being studied. Multi-language support comes later. */
  language: "English",
  daysTracked: 128,
} as const;
