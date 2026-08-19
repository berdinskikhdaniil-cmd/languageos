// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { QualitySeries } from "@/features/mistakes/domain/quality-trend";
import type { CategoryWeakPoint } from "@/features/mistakes/domain/aggregate";
import type { ActivityBucket, ActivitySummary } from "@/features/tracker/domain/buckets";
import { buildHeatmap } from "@/features/tracker/domain/heatmap";
import { getMessages } from "@/lib/i18n/messages";
import type { BalanceShare } from "../domain/analytics";
import { CategoryChart } from "./category-chart";
import { ConsistencyHeatmap } from "./consistency-heatmap";
import { PracticeBalance } from "./practice-balance";
import { QualityChart } from "./quality-chart";
import { StudyTimeChart } from "./study-time-chart";

/**
 * The charts, checked for the things a chart can get wrong without anyone
 * noticing: a label that never rendered, a number that came out `NaN`, and a
 * division that had no denominator.
 *
 * Nothing here snapshots the SVG. A diff of two hundred path coordinates fails
 * for every honest change and passes for the one that matters, so the
 * assertions are on the text a reader actually gets — which is also the
 * accessible version of each chart.
 */

const EN = getMessages("en");
const RU = getMessages("ru");

afterEach(cleanup);

/** Anything that looks like a broken calculation reaching the DOM. */
function expectNoBrokenNumbers(container: HTMLElement) {
  const html = container.innerHTML;
  expect(html).not.toMatch(/NaN/);
  expect(html).not.toMatch(/Infinity/);
  expect(html).not.toMatch(/undefined/);
}

function bucket(key: string, seconds: number, label = key): ActivityBucket {
  return {
    key,
    startsAt: new Date("2026-08-19T00:00:00Z"),
    label,
    seconds,
    byGroup: {
      input: Math.round(seconds * 0.6),
      speaking: Math.round(seconds * 0.25),
      writing: seconds - Math.round(seconds * 0.6) - Math.round(seconds * 0.25),
      other: 0,
    },
  };
}

const SUMMARY: ActivitySummary = {
  seconds: 4 * 3600 + 32 * 60,
  activeDays: 8,
  totalDays: 30,
  averageSecondsPerActiveDay: 34 * 60,
};

describe("StudyTimeChart", () => {
  it("writes the real numbers as text beside the bars", () => {
    const { container } = render(
      <StudyTimeChart
        buckets={[bucket("a", 1800), bucket("b", 0), bucket("c", 3600)]}
        summary={SUMMARY}
        messages={EN}
        language="en"
      />,
    );

    expect(screen.getByText("Study time")).toBeTruthy();
    expect(screen.getByText("4h 32m")).toBeTruthy();
    expect(screen.getByText(/8 active days/)).toBeTruthy();
    expect(screen.getByText(/34m average per active day/)).toBeTruthy();
    expectNoBrokenNumbers(container);
  });

  it("says nothing was logged rather than drawing an empty average", () => {
    const { container } = render(
      <StudyTimeChart
        buckets={[bucket("a", 0)]}
        summary={{ seconds: 0, activeDays: 0, totalDays: 30, averageSecondsPerActiveDay: 0 }}
        messages={EN}
        language="en"
      />,
    );

    expect(screen.getByText("No study time logged in this period.")).toBeTruthy();
    expect(screen.queryByText(/average per active day/)).toBeNull();
    expectNoBrokenNumbers(container);
  });

  it("survives a single bucket without dividing by zero", () => {
    const { container } = render(
      <StudyTimeChart
        buckets={[bucket("only", 600)]}
        summary={SUMMARY}
        messages={EN}
        language="en"
      />,
    );

    expectNoBrokenNumbers(container);
  });

  it("reads in Russian when the account does", () => {
    render(
      <StudyTimeChart
        buckets={[bucket("a", 1800)]}
        summary={SUMMARY}
        messages={RU}
        language="ru"
      />,
    );

    expect(screen.getByText("Время занятий")).toBeTruthy();
    expect(screen.getByText(/8 активных дней/)).toBeTruthy();
  });
});

describe("PracticeBalance", () => {
  const shares: BalanceShare[] = [
    { group: "input", seconds: 2 * 3600 + 48 * 60, percent: 63 },
    { group: "speaking", seconds: 59 * 60, percent: 22 },
    { group: "writing", seconds: 41 * 60, percent: 15 },
  ];

  it("shows every group with its share and its time", () => {
    const { container } = render(
      <PracticeBalance
        shares={shares}
        totalSeconds={shares.reduce((sum, share) => sum + share.seconds, 0)}
        messages={EN}
        language="en"
      />,
    );

    expect(screen.getByText("Input")).toBeTruthy();
    expect(screen.getByText("63% · 2h 48m")).toBeTruthy();
    expect(screen.getByText("22% · 59m")).toBeTruthy();
    expectNoBrokenNumbers(container);
  });

  it("draws nothing at all rather than a bar of invented thirds", () => {
    const { container } = render(
      <PracticeBalance
        shares={shares.map((share) => ({ ...share, seconds: 0, percent: 0 }))}
        totalSeconds={0}
        messages={EN}
        language="en"
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("keeps long Russian group names in the row", () => {
    render(
      <PracticeBalance shares={shares} totalSeconds={10_000} messages={RU} language="ru" />,
    );

    expect(screen.getByText("Восприятие")).toBeTruthy();
    expect(screen.getByText("Говорение")).toBeTruthy();
  });
});

describe("QualityChart", () => {
  function series(values: number[]): QualitySeries {
    return {
      granularity: "week",
      points: values.map((perThousand, index) => ({
        key: `w${index}`,
        startsAt: new Date(`2026-08-${String(3 + index * 7).padStart(2, "0")}T00:00:00Z`),
        label: `${3 + index * 7} Aug`,
        perThousand,
        mistakes: perThousand,
        words: 1000,
      })),
      thinBuckets: 0,
    };
  }

  it("labels the ends and lists every point for a screen reader", () => {
    const { container } = render(<QualityChart series={series([12, 9, 5])} messages={EN} />);

    expect(screen.getByText("3 Aug")).toBeTruthy();
    expect(screen.getByText("17 Aug")).toBeTruthy();
    expect(container.textContent).toContain("3 Aug: 12");
    expect(container.textContent).toContain("17 Aug: 5");
    expectNoBrokenNumbers(container);
  });

  it("draws nothing from a single point", () => {
    const { container } = render(<QualityChart series={series([12])} messages={EN} />);
    expect(container.innerHTML).toBe("");
  });

  it("keeps a flat line finite rather than dividing by a zero range", () => {
    const { container } = render(<QualityChart series={series([7, 7, 7])} messages={EN} />);

    expect(container.querySelector("polyline")?.getAttribute("points")).not.toMatch(/NaN/);
    expectNoBrokenNumbers(container);
  });

  it("says how many periods held too little writing to plot", () => {
    render(<QualityChart series={{ ...series([12, 9]), thinBuckets: 2 }} messages={EN} />);
    expect(screen.getByText(/2 periods held too little writing/)).toBeTruthy();
  });
});

describe("CategoryChart", () => {
  function category(name: CategoryWeakPoint["category"], mistakes: number): CategoryWeakPoint {
    return {
      category: name,
      mistakes,
      suggestions: 0,
      total: mistakes,
      bySource: { writing: mistakes, speaking: 0 },
    };
  }

  it("puts the name and the count in the DOM as text, not only as a bar", () => {
    const { container } = render(
      <CategoryChart
        items={[category("grammar", 9), category("word_choice", 2)]}
        messages={EN}
      />,
    );

    expect(screen.getByText("Grammar")).toBeTruthy();
    expect(screen.getByText("9")).toBeTruthy();
    expect(screen.getByText("Word choice")).toBeTruthy();
    expectNoBrokenNumbers(container);
  });

  it("shows the worst few and leaves the rest to the list below", () => {
    render(
      <CategoryChart
        items={[
          category("grammar", 9),
          category("agreement", 8),
          category("word_order", 7),
          category("word_choice", 6),
          category("spelling", 5),
          category("punctuation", 4),
          category("naturalness", 3),
          category("style", 2),
        ]}
        messages={EN}
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(screen.queryByText("Naturalness")).toBeNull();
  });

  it("draws nothing for categories that hold only suggestions", () => {
    const { container } = render(
      <CategoryChart
        items={[{ ...category("style", 0), suggestions: 4, total: 4 }]}
        messages={EN}
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("keeps a long Russian category name in its row", () => {
    render(<CategoryChart items={[category("agreement", 3)]} messages={RU} />);
    expect(screen.getByText("Согласование")).toBeTruthy();
  });
});

describe("ConsistencyHeatmap", () => {
  const view = buildHeatmap({
    sessions: [
      {
        activityType: "video",
        startedAt: new Date("2026-08-18T08:00:00Z"),
        endedAt: new Date("2026-08-18T08:30:00Z"),
        durationSeconds: 1800,
      },
    ],
    timeZone: "Europe/Amsterdam",
    now: new Date("2026-08-19T09:00:00Z"),
    dailyGoalMinutes: 45,
  });

  it("says which stretch of time it covers and how much of it was used", () => {
    const { container } = render(<ConsistencyHeatmap view={view} messages={EN} />);

    expect(screen.getByText("Consistency")).toBeTruthy();
    expect(screen.getByText("Last 12 weeks")).toBeTruthy();
    expect(screen.getByText(`1 active day of ${view.observedDays}`)).toBeTruthy();
    expectNoBrokenNumbers(container);
  });

  it("creates no focusable cells, because tapping one does nothing", () => {
    const { container } = render(<ConsistencyHeatmap view={view} messages={EN} />);

    expect(container.querySelectorAll("button, a, [tabindex]")).toHaveLength(0);
  });

  it("declines the Russian day count correctly", () => {
    render(<ConsistencyHeatmap view={view} messages={RU} />);
    expect(screen.getByText(/1 активный день из/)).toBeTruthy();
    expect(screen.getByText("Последние 12 недель")).toBeTruthy();
  });
});
