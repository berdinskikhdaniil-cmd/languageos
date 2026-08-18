/**
 * Optional development data. Run explicitly with `npm run db:seed` — nothing
 * calls this on application startup, and it is never part of a build.
 *
 * It writes plausible sessions across this week and last week so the dashboard
 * has something to draw. Existing sessions for the development user are cleared
 * first so repeated runs stay predictable.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { ensureDevelopmentUser } from "@/lib/auth/current-user";
import { ensurePrimaryLanguage } from "@/lib/auth/telegram-login";
import { addLocalDays, startOfLocalWeek } from "@/lib/time";
import type { ActivityType } from "@/features/tracker/domain/activity";

type Plan = { dayOffset: number; activityType: ActivityType; minutes: number; sourceTitle?: string };

const THIS_WEEK: Plan[] = [
  { dayOffset: 0, activityType: "video", minutes: 38, sourceTitle: "Easy German" },
  { dayOffset: 0, activityType: "conversation", minutes: 20 },
  { dayOffset: 1, activityType: "podcast", minutes: 47 },
  { dayOffset: 2, activityType: "video", minutes: 61, sourceTitle: "Interview on YouTube" },
  { dayOffset: 2, activityType: "writing", minutes: 18 },
  { dayOffset: 3, activityType: "reading", minutes: 46, sourceTitle: "Short stories" },
];

const LAST_WEEK: Plan[] = [
  { dayOffset: 0, activityType: "video", minutes: 41 },
  { dayOffset: 1, activityType: "podcast", minutes: 62 },
  { dayOffset: 2, activityType: "reading", minutes: 30 },
  { dayOffset: 3, activityType: "speaking", minutes: 18 },
  { dayOffset: 4, activityType: "video", minutes: 25 },
  { dayOffset: 5, activityType: "writing", minutes: 20 },
];

async function main() {
  // getCurrentUser() reads cookies and only works inside a request, so the seed
  // addresses the development identity directly.
  const account = await ensureDevelopmentUser();
  const language = await ensurePrimaryLanguage(account.id);
  const user = {
    id: account.id,
    timeZone: account.timezone,
    primaryLanguage: { id: language.id, name: language.languageName },
  };

  const now = new Date();
  const weekStart = startOfLocalWeek(now, user.timeZone);
  const lastWeekStart = addLocalDays(weekStart, -7, user.timeZone);

  const deleted = await db
    .delete(sessions)
    .where(eq(sessions.userId, user.id))
    .returning({ id: sessions.id });

  const rows = [
    ...THIS_WEEK.map((plan) => ({ plan, weekStart })),
    ...LAST_WEEK.map((plan) => ({ plan, weekStart: lastWeekStart })),
  ]
    .map(({ plan, weekStart: start }) => {
      const dayStart = addLocalDays(start, plan.dayOffset, user.timeZone);
      // Mid-morning, so the session sits well inside its local day.
      const startedAt = new Date(dayStart.getTime() + 10 * 60 * 60 * 1000);
      if (startedAt.getTime() > now.getTime()) return null;

      return {
        userId: user.id,
        userLanguageId: user.primaryLanguage.id,
        activityType: plan.activityType,
        startedAt,
        endedAt: new Date(startedAt.getTime() + plan.minutes * 60 * 1000),
        durationSeconds: plan.minutes * 60,
        sourceTitle: plan.sourceTitle ?? null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length > 0) await db.insert(sessions).values(rows);

  console.log(
    `Seeded ${rows.length} sessions for ${user.primaryLanguage.name} (removed ${deleted.length}).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
