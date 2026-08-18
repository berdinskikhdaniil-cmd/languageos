# Design rules

These rules outrank any local decision already made in a component. If a screen
disagrees with this file, the screen is wrong. Read this before changing UI.

The values themselves live in [`src/app/globals.css`](../src/app/globals.css).
Never write a colour into a component — add or use a token.

## Typography

- **Manrope only**, loaded via `next/font/google` in the root layout.
- **No monospace anywhere in product UI** — not in captions, labels, dates,
  statistics, headings, navigation or chart axes. Monospace is for code, and
  this is not a developer tool.
- **No Inter.**
- Sentence case. `This week`, not `THIS WEEK`.
- Aim for editorial and product-like: few sizes, real weight contrast, generous
  line height on prose.

## Colour

- Neutral dark background and surfaces. Surfaces lift by **luminance**.
- One accent: **green `#32d583`**, for primary buttons, active navigation,
  important chart bars and lines, selected states, progress and improvement.
- Text on the green is **dark ink** (`--accent-ink`), never white — the green is
  too light to carry white legibly.
- Restraint: the accent marks what to do next and what got better. Everything
  else stays neutral. Do not tint the interface green.
- Data visualisation gets three activity hues (`--data-input`,
  `--data-speaking`, `--data-writing`) plus a ghost tone. Do not add a fourth.

## Labels

- **No decorative dot before a text label.** No `● Coach`, no `● Input`.
- **No uppercase overlines above a heading.** A card starts with its content.
- Prefer sentence case in a normal size and weight, with `--text-muted` for
  secondary. No wide letter spacing as a way of signalling "secondary".
- Drop the label entirely when context already answers it.
- Dots are allowed **only** as genuine legend markers distinguishing several
  data series, and only where order or position cannot do the job instead.

## Numbers and change

- **No pills or badges for numeric change.** No capsule, no border, no arrow
  glyph for a plain percentage.
- Write the change as a sentence: `+18% from last week`, `Down 22% from 105`.
  Colour the figure (accent for better, `--negative` for worse) and leave the
  rest muted. Use [`MetricChange`](../src/components/ui/metric-change.tsx).

## Cards and surfaces

- **A filled surface takes no outline.** Background tone, spacing and hierarchy
  do the separating.
- Not every block needs a card. Sections on the bare background are the default;
  a surface is for something that is genuinely a distinct object.
- Borders are for inputs, dividers, focus and selected states, and rare
  structural cases. Nothing else.

## Icons

- Functional icons are fine: navigation, buttons where they aid recognition,
  controls.
- **No decorative icon inside a circle or rounded tile** above a page heading,
  card heading or empty state. Empty states work through typography, spacing
  and copy.

## Motion

- Sparing. One deliberate moment beats scattered effects.
- Always honour `prefers-reduced-motion`.

## Layout

- Mobile-first. The design target is a phone from 360px up; desktop is the same
  column, centred.
- Respect Telegram safe areas via the `--safe-top` / `--safe-bottom` tokens.
- No horizontal overflow at any width, ever.

## Not this

No neon. No glassmorphism. No glowing borders. No large gradients. No gamer or
cartoon styling. No generic SaaS dashboard. No Material Design. No
developer-tool aesthetic. No grids of small outlined cards.

The feeling to aim for: **a calm personal operating system for language
learning.**
