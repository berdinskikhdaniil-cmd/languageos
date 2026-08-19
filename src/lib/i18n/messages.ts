import type { ActivityGroup, ActivityType } from "@/features/tracker/domain/activity";
import type { WritingEntryStatus } from "@/features/writing/domain/entry-status";
import type { IssueCategory, IssueSeverity } from "@/features/writing/domain/review";
import {
  MAX_WRITING_CHARS,
  MIN_WRITING_CHARS,
  type WritingType,
} from "@/features/writing/domain/writing-entry";
import type { AppErrorCode } from "@/lib/errors";
import { DEFAULT_UI_LANGUAGE, intlLocale, type UiLanguage } from "./locale";
import { pluralize } from "./plural";

/**
 * Every word the product says, in both languages it speaks.
 *
 * One file on purpose. Two languages do not need a framework, a loader, a
 * namespace scheme or a build step — they need one place where a sentence can be
 * read next to its translation, and a compiler that refuses a dictionary with a
 * key missing. That second part is what `Messages = typeof en` buys: English is
 * the shape, Russian must match it exactly, and a key added to one and not the
 * other fails `npm run typecheck` rather than rendering `undefined`.
 *
 * Two rules hold this file together.
 *
 * **Display text only.** Nothing here is an identifier. Activity types, writing
 * types, issue categories, severities and language codes keep their canonical
 * values in the database and in the domain; the records below only decide what
 * a reader sees. `Видео` is never stored anywhere — `video` is.
 *
 * **Nothing is assembled in a component.** A sentence that needs a number or a
 * name is a function here, not a template literal next to some JSX, because
 * Russian puts the pieces in a different order and a component has no business
 * knowing that.
 */

/** Where a review that did not happen is explained. See writing/domain/failures. */
export type ReviewFailureKey =
  | "notConfigured"
  | "limitReached"
  | "processing"
  | "rateLimited"
  | "timeout"
  | "unavailable"
  | "unknown";

const en = {
  nav: {
    home: "Home",
    practice: "Practice",
    progress: "Progress",
    library: "Library",
  },

  common: {
    back: "Back",
    continue: "Continue",
    change: "Change",
    saving: "Saving…",
    working: "Working…",
    optional: "Optional",
  },

  units: {
    /** "4h" — the hours half of a duration. */
    hours: (count: number) => `${count}h`,
    /** "32m" — the minutes half, and a whole duration under an hour. */
    minutes: (count: number) => `${count}m`,
    /** A session that has started but not yet reached a minute. */
    underAMinute: "<1m",
    /** The suffix beside the minutes field in the manual-entry sheet. */
    hourSuffix: "h",
    minuteSuffix: "m",
    /** "45 min", on the goal buttons. */
    minutesShort: "min",
  },

  change: {
    /** Opens a sentence: "Up 18% from last week". */
    up: (percent: string) => `Up ${percent}`,
    down: (percent: string) => `Down ${percent}`,
    none: "No change",
  },

  dates: {
    today: "Today",
    yesterday: "Yesterday",
  },

  auth: {
    outsideTelegram: "Open Language OS from Telegram to continue.",
    signingIn: "Signing you in…",
    couldNotSignIn: "Could not sign you in right now.",
    noConnection: "No connection to the server.",
    tryAgain: "Try again",
  },

  header: {
    /** Screen-reader name for the avatar that opens Settings. */
    settingsFor: (name: string | null) =>
      name ? `Profile and settings for ${name}` : "Profile and settings for your account",
  },

  dashboard: {
    title: "Dashboard",
    thisWeek: "This week",
    today: "Today",
    nothingThisWeek: "Nothing logged this week yet.",
    noPreviousWeek: "No time logged last week to compare with.",
    fromLastWeek: (previous: string) => `from last week’s ${previous}`,
    goalMarker: (minutes: number) => `${minutes}m goal`,
    weekSummary: (total: string, goalMinutes: number, days: string) =>
      `${total} this week. Daily goal ${goalMinutes} minutes. ${days}.`,
    daySummary: (day: string, minutes: number) => `${day} ${minutes} minutes`,
    nothingToday: "Start a session or add time you already spent.",
    unavailableTitle: "Your tracker is not reachable right now.",
    /** The command stays a command — it is typed, not read. */
    unavailableBody: (command: string) =>
      `The database is not responding. In local development, start it with ${command} and reload.`,
    allProgress: "All progress",
    demo: {
      coachHeadline: "Input is running well ahead of speaking.",
      coachDetail: "Five minutes out loud today would even out the week.",
      coachAction: "Start speaking",
      trendLabel: "Errors / 1000 words",
      trendFrom: (from: number) => `from ${from}`,
      trendCaption: "Demo figures until writing review is built.",
    },
  },

  tracker: {
    region: "Tracker",
    startSession: "Start session",
    speakingTile: "Speaking",
    writeTile: "Write",
    addManuallyTile: "Add manually",
    runningSession: "Running session",
    stopSession: "Stop session",
    discard: "Discard",
    minutesElapsed: (minutes: number) => `${minutes} minutes elapsed`,
    startSheetTitle: "What are you doing?",
    starting: "Starting…",
    startSheetNote:
      "Speaking practice gets its own guided flow later, so it is not a stopwatch here.",
    manualSheetTitle: "Add a session",
    activity: "Activity",
    howLong: "How long",
    hoursField: "Hours",
    minutesField: "Minutes",
    durationPreset: (minutes: number) => `${minutes}m`,
    day: "Day",
    whatWasIt: "What was it?",
    sourcePlaceholder: "Podcast name, book, channel…",
    noteField: "Note",
    notePlaceholder: "A note to your future self",
    saveSession: "Save session",
    activityTypes: {
      video: "Video",
      podcast: "Podcast",
      reading: "Reading",
      conversation: "Conversation",
      writing: "Writing",
      speaking: "Speaking",
      other: "Other",
    } satisfies Record<ActivityType, string>,
    activityGroups: {
      input: "Input",
      speaking: "Speaking",
      writing: "Writing",
      other: "Other",
    } satisfies Record<ActivityGroup, string>,
  },

  practice: {
    title: "Practice",
    intro: "Use the language, not just consume it.",
    writingHeading: "Writing",
    writingIntro:
      "Write something, and get it back with the mistakes marked, explained and corrected.",
    startWriting: "Start writing",
    speakingHeading: "Speaking",
    speakingSoon: "Speaking practice is coming next.",
    recentWriting: "Recent writing",
  },

  writing: {
    types: {
      free_writing: "Free writing",
      retelling: "Retelling",
    } satisfies Record<WritingType, string>,
    entryStatuses: {
      needs_review: "Needs review",
      reviewed: "Reviewed",
      rewritten: "Rewritten",
    } satisfies Record<WritingEntryStatus, string>,
    categories: {
      grammar: "Grammar",
      agreement: "Agreement",
      word_order: "Word order",
      word_choice: "Word choice",
      spelling: "Spelling",
      punctuation: "Punctuation",
      naturalness: "Naturalness",
      style: "Style",
      other: "Other",
    } satisfies Record<IssueCategory, string>,
    severities: {
      error: "Mistake",
      awkward: "Awkward",
      style: "Style",
    } satisfies Record<IssueSeverity, string>,

    composerTitle: "Writing",
    composerIntro: (languageName: string) =>
      `Write something in ${languageName} and get it back with the mistakes marked, explained and corrected.`,
    modeFreeDescription: "Write about anything at all.",
    modeRetellingDescription: "Retell something you watched, read or listened to.",
    freePrompt: (languageName: string) => `Write in ${languageName}. Anything you like.`,
    retellingPrompt: (languageName: string) =>
      `Retell it in ${languageName}, in your own words.`,
    freePlaceholder: "Start anywhere. A few sentences is enough.",
    retellingPlaceholder: "What happened, and what did you think of it?",
    /** Screen-reader name for the composer's text box. */
    yourTextField: (typeLabel: string) => `Your ${typeLabel.toLowerCase()}`,
    wordCount: (count: number) => pluralize("en", count, { one: "word", other: "words" }),
    changeType: "Change type",
    reviewMyWriting: "Review my writing",
    reviewing: "Reviewing…",
    reviewingNote: "Saving your writing and reading it. This takes a few seconds.",

    feedback: "Feedback",
    yourWriting: "Your writing",
    tapHighlight: "Tap a highlighted phrase to see the correction.",
    otherFeedback: "Other feedback",
    // Annotated because a ternary over two literals would otherwise infer a
    // union of those exact English sentences as the shape every language owes.
    unplacedNote: (count: number): string =>
      count === 1
        ? "This one could not be pinned to an exact phrase."
        : "These could not be pinned to an exact phrase.",
    nothingToFix: "Nothing to fix",
    nothingToFixBody: "No concrete mistakes were found in this one.",
    betterVersion: "Better version",
    rewriteIt: "Rewrite it",
    rewriteInvitation:
      "You get your own text back, not the corrected one. Fixing it yourself is the part that sticks.",
    yourRewrite: "Your rewrite",
    savedYourRewrite: "Saved · your rewrite",
    editRewrite: "Edit the rewrite",
    rewriteTitle: "Rewrite it",
    rewriteIntro: "Your own text, as you wrote it. Fix what the review pointed at.",
    rewriteField: "Your rewrite",
    saveRewrite: "Save rewrite",
    backToReview: "Back to the review",
    tryReviewAgain: "Try review again",
    writeSomethingElse: "Write something else",

    correctionRegion: "Correction",
    closeCorrection: "Close correction",
    removeIt: "Remove it",
    /** "Grammar · past tense · Mistake", the empty pieces already dropped. */
    issueMeta: (parts: readonly string[]) => parts.join(" · "),
    /** What a screen reader announces for a marked phrase. */
    highlightLabel: (fragment: string, description: string) => `${fragment} — ${description}`,
    /** The same description, comma-joined, for the mark itself. */
    highlightDescription: (parts: readonly string[]) => parts.join(", "),

    composerUnavailableTitle: "Writing is not reachable.",
    composerUnavailableBody: "The database is not responding. Reload in a moment.",
    entryUnavailableTitle: "Your writing is not reachable right now.",
    entryUnavailableBody:
      "The database is not responding. Nothing has been lost — reload in a moment.",

    failures: {
      notConfigured:
        "AI review is not switched on for this installation yet. Your writing is saved.",
      limitReached:
        "You have used today’s reviews. Your writing is saved, and you can review it tomorrow.",
      processing: "This is being reviewed right now. Give it a moment and reload.",
      rateLimited: "The reviewer is busy right now. Your writing is saved — try again in a minute.",
      timeout: "The review took too long. Your writing is saved — try again.",
      unavailable: "AI review is unavailable on this installation right now. Your writing is saved.",
      unknown: "We couldn’t review this yet. Your writing is saved.",
    } satisfies Record<ReviewFailureKey, string>,
  },

  onboarding: {
    stepOf: (step: number, total: number) => `${step} of ${total}`,
    languageTitle: "What language are you learning?",
    languageDescription: "Everything you track, practise and review is filed under it.",
    searchLanguages: "Search languages",
    noLanguageMatch: "No match. Try the language’s English name — or tell us and we will add it.",

    timezoneTitle: "Your timezone",
    timezoneDescription: "We use this to calculate your days, weeks and streaks correctly.",
    looksRight: "Looks right",
    unknownZone: "Unknown",
    localTimeNow: (time: string) => `It is ${time} there right now.`,
    localTimeUnknown: "We could not read the local time.",
    pickZoneTitle: "Where are you?",
    pickZoneDescription: "Pick the city closest to you. Daylight saving is handled for you.",
    searchTimeZones: "Search cities and regions",
    searchTimeZonesLabel: "Search timezones",
    noZoneMatch: "No zone matches that. Try a nearby capital.",
    searchAllZones: (count: number) => `Start typing to search all ${count} zones.`,

    goalTitle: "How much language time do you want each day?",
    goalDescription:
      "The weekly chart is drawn against it. Missing a day is fine — the line is there to aim at.",
    startLearning: "Start learning",
    settingUp: "Setting up…",

    unavailableTitle: "Setup is not reachable right now.",
    unavailableBody:
      "The database is not responding. Reload in a moment and we will pick up where you left off.",
  },

  settings: {
    title: "Settings",
    interfaceLanguage: "Interface language",
    interfaceLanguageNote: "Applies straight away, and to every launch after this one.",
    /** The two rows are always written in their own language, never translated. */
    languageNames: { en: "English", ru: "Русский" } satisfies Record<UiLanguage, string>,
  },

  placeholders: {
    progress: {
      title: "Progress",
      description:
        "Hours with the language, error rates by category, and your first recording next to your latest one.",
    },
    library: {
      title: "Library",
      description:
        "Everything you have watched, read and listened to, plus the words and phrases you saved from it.",
    },
  },

  errors: {
    AUTH_EXPIRED: "Your session has expired. Reopen the app from Telegram.",
    ONBOARDING_REQUIRED: "Finish setting up your language first.",

    SESSION_ALREADY_RUNNING: "A session is already running. Stop it before starting another.",
    NO_SESSION_RUNNING: "No session is running.",
    SESSION_ALREADY_STOPPED: "That session was already stopped.",

    SESSION_START_FAILED: "Could not start the session. Try again.",
    SESSION_STOP_FAILED: "Could not stop the session. Try again.",
    SESSION_DISCARD_FAILED: "Could not discard the session. Try again.",
    SESSION_SAVE_FAILED: "Could not save the session. Try again.",

    ACTIVITY_REQUIRED: "Choose what you were doing.",
    DURATION_NOT_WHOLE: "Enter whole hours and minutes.",
    DURATION_REQUIRED: "Enter how long it lasted.",
    DURATION_TOO_LONG: "That is longer than a day.",
    DATE_REQUIRED: "Pick a date.",
    DATE_IN_FUTURE: "That day has not happened yet.",

    WRITING_TYPE_REQUIRED: "Choose what kind of writing this is.",
    WRITING_TEXT_REQUIRED: "Write something first.",
    WRITING_TOO_SHORT: `Write a little more — at least ${MIN_WRITING_CHARS} characters.`,
    WRITING_TOO_LONG: `That is longer than ${MAX_WRITING_CHARS.toLocaleString(
      intlLocale("en"),
    )} characters. Review it in parts.`,
    WRITING_NOT_FOUND: "That writing could not be found.",
    WRITING_SAVE_FAILED: "Could not save your writing. Try again.",
    WRITING_REVIEW_FAILED: "Could not review your writing. Try again.",
    REWRITE_SAVE_FAILED: "Could not save your rewrite. Try again.",

    LANGUAGE_REQUIRED: "Choose the language you are learning.",
    TIMEZONE_REQUIRED: "Choose your timezone.",
    GOAL_REQUIRED: "Choose a daily goal.",
    ONBOARDING_SAVE_FAILED: "Could not save your setup. Try again.",

    UI_LANGUAGE_INVALID: "Choose one of the interface languages offered.",
    SETTINGS_SAVE_FAILED: "Could not save that. Try again.",
  } satisfies Record<AppErrorCode, string>,
};

/**
 * The shape of the product's vocabulary, taken from the English dictionary.
 *
 * Every other language is checked against it, so "does Russian have this key"
 * is answered by the compiler rather than by a missing string on a screen.
 */
export type Messages = typeof en;

const ru: Messages = {
  nav: {
    home: "Главная",
    practice: "Практика",
    progress: "Прогресс",
    /**
     * "Библиотека" would be a shelf of books. The route is everything the
     * learner has watched, read and heard plus the words saved from it, so the
     * word that will still be right when vocabulary lands is "Материалы".
     */
    library: "Материалы",
  },

  common: {
    back: "Назад",
    continue: "Продолжить",
    change: "Изменить",
    saving: "Сохраняем…",
    working: "Секунду…",
    optional: "Необязательно",
  },

  units: {
    hours: (count: number) => `${count} ч`,
    minutes: (count: number) => `${count} мин`,
    underAMinute: "<1 мин",
    hourSuffix: "ч",
    minuteSuffix: "мин",
    minutesShort: "мин",
  },

  change: {
    up: (percent: string) => `Больше на ${percent}`,
    down: (percent: string) => `Меньше на ${percent}`,
    none: "Без изменений",
  },

  dates: {
    today: "Сегодня",
    yesterday: "Вчера",
  },

  auth: {
    outsideTelegram: "Откройте Language OS из Telegram, чтобы продолжить.",
    signingIn: "Входим…",
    couldNotSignIn: "Сейчас не удалось вас впустить.",
    noConnection: "Нет связи с сервером.",
    tryAgain: "Попробовать снова",
  },

  header: {
    settingsFor: (name: string | null) =>
      name ? `Профиль и настройки: ${name}` : "Профиль и настройки",
  },

  dashboard: {
    title: "Главная",
    thisWeek: "На этой неделе",
    today: "Сегодня",
    nothingThisWeek: "На этой неделе пока ничего не записано.",
    noPreviousWeek: "На прошлой неделе нет времени для сравнения.",
    fromLastWeek: (previous: string) => `против ${previous} на прошлой неделе`,
    goalMarker: (minutes: number) => `цель ${minutes} мин`,
    weekSummary: (total: string, goalMinutes: number, days: string) =>
      `${total} на этой неделе. Цель на день — ${goalMinutes} минут. ${days}.`,
    daySummary: (day: string, minutes: number) => `${day}: ${minutes} минут`,
    nothingToday: "Запустите таймер или добавьте время, которое уже провели.",
    unavailableTitle: "Трекер сейчас недоступен.",
    unavailableBody: (command: string) =>
      `База данных не отвечает. В локальной разработке запустите её командой ${command} и перезагрузите страницу.`,
    allProgress: "Весь прогресс",
    demo: {
      coachHeadline: "Слушаете и читаете намного больше, чем говорите.",
      coachDetail: "Пять минут вслух сегодня выровняли бы неделю.",
      coachAction: "Начать говорить",
      trendLabel: "Ошибок на 1000 слов",
      trendFrom: (from: number) => `против прежних ${from}`,
      trendCaption: "Демо-цифры, пока разбор письма не подключён.",
    },
  },

  tracker: {
    region: "Трекер",
    startSession: "Запустить таймер",
    speakingTile: "Говорение",
    writeTile: "Письмо",
    // One word: the tile is a third of a 360px row, under a "+" icon that
    // already says "add". "Добавить вручную" only ever rendered truncated.
    addManuallyTile: "Вручную",
    runningSession: "Идёт занятие",
    stopSession: "Остановить",
    discard: "Отменить",
    minutesElapsed: (minutes: number) => `прошло ${minutes} минут`,
    startSheetTitle: "Чем вы занимаетесь?",
    starting: "Запускаем…",
    startSheetNote:
      "Для говорения позже будет отдельный сценарий с разбором, поэтому здесь его нет.",
    manualSheetTitle: "Добавить занятие",
    activity: "Занятие",
    howLong: "Сколько времени",
    hoursField: "Часы",
    minutesField: "Минуты",
    durationPreset: (minutes: number) => `${minutes} мин`,
    day: "День",
    whatWasIt: "Что это было?",
    sourcePlaceholder: "Название подкаста, книги, канала…",
    noteField: "Заметка",
    notePlaceholder: "Заметка себе на будущее",
    saveSession: "Сохранить",
    activityTypes: {
      video: "Видео",
      podcast: "Подкаст",
      reading: "Чтение",
      conversation: "Разговор",
      writing: "Письмо",
      speaking: "Говорение",
      other: "Другое",
    } satisfies Record<ActivityType, string>,
    activityGroups: {
      /** Video, podcasts and reading together: what goes in rather than out. */
      input: "Восприятие",
      speaking: "Говорение",
      writing: "Письмо",
      other: "Другое",
    } satisfies Record<ActivityGroup, string>,
  },

  practice: {
    title: "Практика",
    intro: "Язык нужно использовать, а не только потреблять.",
    writingHeading: "Письмо",
    writingIntro: "Напишите текст и получите его обратно с разобранными ошибками.",
    startWriting: "Начать писать",
    speakingHeading: "Говорение",
    speakingSoon: "Практика говорения появится следующей.",
    recentWriting: "Последние тексты",
  },

  writing: {
    types: {
      free_writing: "Свободное письмо",
      retelling: "Пересказ",
    } satisfies Record<WritingType, string>,
    entryStatuses: {
      needs_review: "Нужен разбор",
      reviewed: "Разобрано",
      rewritten: "Переписано",
    } satisfies Record<WritingEntryStatus, string>,
    categories: {
      grammar: "Грамматика",
      agreement: "Согласование",
      word_order: "Порядок слов",
      word_choice: "Выбор слова",
      spelling: "Орфография",
      punctuation: "Пунктуация",
      naturalness: "Естественность",
      style: "Стиль",
      other: "Другое",
    } satisfies Record<IssueCategory, string>,
    severities: {
      error: "Ошибка",
      awkward: "Неестественно",
      style: "Стиль",
    } satisfies Record<IssueSeverity, string>,

    composerTitle: "Письмо",
    /**
     * The language name comes from `Intl.DisplayNames` in the nominative
     * ("Английский"), and Russian would need the prepositional after "на".
     * Declining it here would mean a case table for fifty languages, half of
     * which are indeclinable nouns — so the sentence is built to put the name
     * where the nominative is the correct form. Same reason below.
     */
    composerIntro: (languageName: string) =>
      `Ваш язык — ${languageName}. Напишите текст и получите его обратно с разобранными и исправленными ошибками.`,
    modeFreeDescription: "Напишите о чём угодно.",
    modeRetellingDescription: "Перескажите то, что смотрели, читали или слушали.",
    freePrompt: (languageName: string) => `Ваш язык — ${languageName}. Пишите о чём угодно.`,
    retellingPrompt: (languageName: string) =>
      `Ваш язык — ${languageName}. Перескажите это своими словами.`,
    freePlaceholder: "Начните с чего угодно. Хватит и нескольких предложений.",
    retellingPlaceholder: "Что там произошло и что вы об этом думаете?",
    yourTextField: (typeLabel: string) => `Ваш текст: ${typeLabel.toLowerCase()}`,
    wordCount: (count: number) =>
      pluralize("ru", count, { one: "слово", few: "слова", many: "слов", other: "слов" }),
    changeType: "Сменить тип",
    reviewMyWriting: "Разобрать мой текст",
    reviewing: "Разбираем…",
    reviewingNote: "Сохраняем текст и читаем его. Это займёт несколько секунд.",

    feedback: "Разбор",
    yourWriting: "Ваш текст",
    tapHighlight: "Нажмите на подчёркнутую фразу, чтобы увидеть исправление.",
    otherFeedback: "Остальные замечания",
    unplacedNote: (count: number) =>
      count === 1
        ? "Это замечание не удалось привязать к точной фразе."
        : "Эти замечания не удалось привязать к точным фразам.",
    nothingToFix: "Исправлять нечего",
    nothingToFixBody: "Конкретных ошибок в этом тексте не нашлось.",
    betterVersion: "Как было бы лучше",
    rewriteIt: "Переписать",
    rewriteInvitation:
      "Вы получите свой собственный текст, а не исправленный. Запоминается именно то, что исправили сами.",
    yourRewrite: "Ваша новая версия",
    savedYourRewrite: "Сохранено · ваша новая версия",
    editRewrite: "Изменить новую версию",
    rewriteTitle: "Переписать",
    rewriteIntro: "Ваш текст, как вы его написали. Исправьте то, на что указал разбор.",
    rewriteField: "Ваша новая версия",
    saveRewrite: "Сохранить версию",
    backToReview: "Вернуться к разбору",
    tryReviewAgain: "Попробовать разбор снова",
    writeSomethingElse: "Написать что-нибудь ещё",

    correctionRegion: "Исправление",
    closeCorrection: "Закрыть исправление",
    removeIt: "Убрать",
    issueMeta: (parts: readonly string[]) => parts.join(" · "),
    highlightLabel: (fragment: string, description: string) => `${fragment} — ${description}`,
    highlightDescription: (parts: readonly string[]) => parts.join(", "),

    composerUnavailableTitle: "Письмо сейчас недоступно.",
    composerUnavailableBody: "База данных не отвечает. Перезагрузите страницу через минуту.",
    entryUnavailableTitle: "Ваш текст сейчас недоступен.",
    entryUnavailableBody:
      "База данных не отвечает. Ничего не потеряно — перезагрузите страницу через минуту.",

    failures: {
      notConfigured: "Разбор с ИИ в этой установке пока не включён. Ваш текст сохранён.",
      limitReached:
        "На сегодня разборы закончились. Текст сохранён — вернитесь к нему завтра.",
      processing: "Этот текст разбирается прямо сейчас. Подождите немного и перезагрузите страницу.",
      rateLimited: "Разбор сейчас занят. Текст сохранён — попробуйте через минуту.",
      timeout: "Разбор занял слишком много времени. Текст сохранён — попробуйте снова.",
      unavailable: "Разбор с ИИ в этой установке сейчас недоступен. Ваш текст сохранён.",
      unknown: "Пока не удалось разобрать этот текст. Он сохранён.",
    } satisfies Record<ReviewFailureKey, string>,
  },

  onboarding: {
    stepOf: (step: number, total: number) => `${step} из ${total}`,
    languageTitle: "Какой язык вы учите?",
    languageDescription: "Всё, что вы отмечаете, практикуете и разбираете, относится к нему.",
    searchLanguages: "Поиск языка",
    noLanguageMatch:
      "Ничего не нашлось. Попробуйте английское название — или напишите нам, и мы добавим язык.",

    timezoneTitle: "Ваш часовой пояс",
    timezoneDescription: "По нему мы считаем ваши дни, недели и серии занятий.",
    looksRight: "Всё верно",
    unknownZone: "Неизвестно",
    localTimeNow: (time: string) => `Там сейчас ${time}.`,
    localTimeUnknown: "Не удалось узнать местное время.",
    pickZoneTitle: "Где вы находитесь?",
    pickZoneDescription: "Выберите ближайший к вам город. Переход на летнее время учтём сами.",
    searchTimeZones: "Поиск города или региона",
    searchTimeZonesLabel: "Поиск часового пояса",
    noZoneMatch: "Такого пояса не нашлось. Попробуйте ближайшую столицу.",
    searchAllZones: (count: number) =>
      `Начните печатать, чтобы искать среди всех поясов (${count}).`,

    goalTitle: "Сколько времени в день вы хотите уделять языку?",
    goalDescription:
      "По этой цели строится недельный график. Пропустить день не страшно — это ориентир, а не норма.",
    startLearning: "Начать учиться",
    settingUp: "Настраиваем…",

    unavailableTitle: "Настройка сейчас недоступна.",
    unavailableBody:
      "База данных не отвечает. Перезагрузите страницу через минуту — мы продолжим с того же места.",
  },

  settings: {
    title: "Настройки",
    interfaceLanguage: "Язык интерфейса",
    interfaceLanguageNote: "Применяется сразу и ко всем следующим запускам.",
    languageNames: { en: "English", ru: "Русский" } satisfies Record<UiLanguage, string>,
  },

  placeholders: {
    progress: {
      title: "Прогресс",
      description:
        "Часы с языком, доля ошибок по категориям и ваша первая запись рядом с последней.",
    },
    library: {
      title: "Материалы",
      description:
        "Всё, что вы смотрели, читали и слушали, и слова с выражениями, которые вы оттуда сохранили.",
    },
  },

  errors: {
    AUTH_EXPIRED: "Сессия истекла. Откройте приложение из Telegram заново.",
    ONBOARDING_REQUIRED: "Сначала завершите настройку языка.",

    SESSION_ALREADY_RUNNING: "Одно занятие уже идёт. Остановите его, прежде чем начинать новое.",
    NO_SESSION_RUNNING: "Сейчас нет идущего занятия.",
    SESSION_ALREADY_STOPPED: "Это занятие уже остановлено.",

    SESSION_START_FAILED: "Не удалось запустить таймер. Попробуйте снова.",
    SESSION_STOP_FAILED: "Не удалось остановить занятие. Попробуйте снова.",
    SESSION_DISCARD_FAILED: "Не удалось отменить занятие. Попробуйте снова.",
    SESSION_SAVE_FAILED: "Не удалось сохранить занятие. Попробуйте снова.",

    ACTIVITY_REQUIRED: "Выберите, чем вы занимались.",
    DURATION_NOT_WHOLE: "Введите целые часы и минуты.",
    DURATION_REQUIRED: "Введите, сколько это длилось.",
    DURATION_TOO_LONG: "Это больше суток.",
    DATE_REQUIRED: "Выберите дату.",
    DATE_IN_FUTURE: "Этот день ещё не наступил.",

    WRITING_TYPE_REQUIRED: "Выберите тип текста.",
    WRITING_TEXT_REQUIRED: "Сначала напишите текст.",
    WRITING_TOO_SHORT: `Напишите чуть больше — минимум ${MIN_WRITING_CHARS} символов.`,
    WRITING_TOO_LONG: `Это длиннее ${MAX_WRITING_CHARS.toLocaleString(
      intlLocale("ru"),
    )} символов. Разберите текст по частям.`,
    WRITING_NOT_FOUND: "Этот текст не найден.",
    WRITING_SAVE_FAILED: "Не удалось сохранить текст. Попробуйте снова.",
    WRITING_REVIEW_FAILED: "Не удалось разобрать текст. Попробуйте снова.",
    REWRITE_SAVE_FAILED: "Не удалось сохранить новую версию. Попробуйте снова.",

    LANGUAGE_REQUIRED: "Выберите язык, который вы учите.",
    TIMEZONE_REQUIRED: "Выберите часовой пояс.",
    GOAL_REQUIRED: "Выберите цель на день.",
    ONBOARDING_SAVE_FAILED: "Не удалось сохранить настройки. Попробуйте снова.",

    UI_LANGUAGE_INVALID: "Выберите один из предложенных языков интерфейса.",
    SETTINGS_SAVE_FAILED: "Не удалось это сохранить. Попробуйте снова.",
  } satisfies Record<AppErrorCode, string>,
};

const DICTIONARIES: Record<UiLanguage, Messages> = { en, ru };

/**
 * The vocabulary for one language.
 *
 * Both dictionaries are static and small, so this is a lookup rather than a
 * load: there is nothing asynchronous about it, nothing to await, and a server
 * component and a client component reach the same object.
 */
export function getMessages(language: UiLanguage = DEFAULT_UI_LANGUAGE): Messages {
  return DICTIONARIES[language] ?? DICTIONARIES[DEFAULT_UI_LANGUAGE];
}

/** Exposed for the test that holds the two dictionaries to the same keys. */
export const ALL_DICTIONARIES = DICTIONARIES;
