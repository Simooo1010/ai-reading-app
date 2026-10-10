# Reading Room — design system (code side)

The single visual model for the AI Reading App. Bookish and quiet: one serif (Newsreader), hairline rules instead of boxes, no shadows, no gradients, no emoji, no icons in the tab bar.

**Two-colour rule.** Only ground `#FCF3DC` and ink `#500101`. Every other colour is a tint of these two (`ink-2`, `wash`, `rule`). No third hue, ever. Charts use ink, ink opacity, hatching, outlines and direct labels.

Visual source of truth: the Design System artifact https://claude.ai/artifact/ADzKSrembPx1X6ZEur54AX and the screens board https://claude.ai/artifact/SmmXSGmcU3JAgy8sBzGSLA. If code and boards disagree, the boards win.

Open items: dark theme is not designed yet (light only, do not invent one). `wash` and `rule` were derived against an older ground and need a review against `#FCF3DC`.

## Import

```tsx
// app/layout.tsx
import { Newsreader } from "next/font/google";
import "@/design-system/tokens.css";      // 1. tokens + base
import "@/design-system/components.css";  // 2. rr- classes

const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],                 // variable font: wght 400-700 + opsz 6-72
  variable: "--font-newsreader",  // tokens.css maps this into --rr-font-serif
  display: "swap",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={newsreader.variable}><body>{children}</body></html>;
}
```

## Tokens (`tokens.css`, all `--rr-`)

| Group | Tokens |
|---|---|
| Colour | `ground` page · `on-ink` text on ink · `ink` text, fills, strong rules · `ink-2` secondary text, track outlines · `wash` tracks, Done button · `rule` hairlines only (never text) · `hatch-opacity` .55 |
| Font | `font-serif` (Newsreader). Class `.rr-num` = `lining-nums tabular-nums` for data |
| Type | `text-<name>-size/-lh/-weight/-tracking` for display 48, stat-xl 64, stat-lg 40, stat-md 34, stat-sm 28, stat-note 21, phase 28, author 20, row-title 19, body 18, body-italic 18, meta 16, meta-italic 15, label 14, chip 14 (hero 15), button 17, tab 14, axis 13 |
| Space | `space-1..5` = 4 · 8 · 12 · 16 · 24 |
| Layout | `page-gutter` 24 · `page-top` 48 · `tabbar-bottom` 34 · `tap-min` 44 |
| Radius | `radius-sm` 3 (bar ends) · `radius-md` 6 (default) · `radius-track` 1 (chart tracks) |

## Components (`components.css`)

| Class | Use | Example |
|---|---|---|
| `.rr-screen` + `__main` | 390 first, fluid, max 480 centred, safe-area aware | `<div class="rr-screen"><main class="rr-screen__main">…</main><nav class="rr-tabbar">…</nav></div>` |
| `.rr-header` | screen name + italic context, hairline under | `<header class="rr-header"><span class="rr-label">Today</span><span class="rr-header__context">Phase 1 · item 1 of 189</span></header>` |
| `.rr-label` (`--ink`) | tracked uppercase eyebrow / section title | `<h2 class="rr-label">Why read this</h2>` |
| `.rr-chip` (`--hero`, `--dashed`) | layer chip; dashed = unknown | `<span class="rr-chip">3 · Species</span>` |
| `.rr-core` | diamond + CORE | `<span class="rr-core">Core</span>` |
| `.rr-status` `--done/--reading/--todo/--skipped` | status, never colour only | `<span class="rr-status rr-status--done">Done</span>` |
| `.rr-btn` `--primary/--secondary/--affirm/--link` | 44px, content width; `.rr-actions` / `__row` lay them out | `<a class="rr-btn rr-btn--primary" href="…" target="_blank" rel="noopener">Open source</a>` |
| `.rr-rule` (`--strong`, `--hair`); `.rr-section` (`--hair`) | rule; section opened by ink rule + label | `<section class="rr-section"><h2 class="rr-label">Up next</h2>…</section>` |
| `.rr-list` (`--ruled`) + `.rr-row` | ListRow (Up next, Path); `--skipped`, `--placeholder` | see below |
| `.rr-phase` | collapsible PhaseBlock, chevron turns via `aria-expanded` | see below |
| `.rr-progress` `--sm/--md/--lg` (`--outlined`) | 6 / 8 / 10px bar; outlined on Progress | `<div class="rr-progress rr-progress--md rr-progress--outlined" role="progressbar" aria-valuenow="2" aria-valuemin="0" aria-valuemax="100" aria-label="2% read"><div class="rr-progress__fill" style="width:2%"></div></div>` |
| `.rr-stat` (`--end`), `.rr-stat-pair`, `.rr-tally` | label, number `__number--xl/lg/md/sm` (+`__unit`), `__empty`, `__helper` (`--lg`) | `<div class="rr-stat"><h2 class="rr-label">Streak</h2><p class="rr-stat__number rr-stat__number--sm">2 days</p><p class="rr-stat__helper">since Fri 9 Oct</p></div>` |
| `.rr-tabbar` + `__tab` | hairline top, rule over active (`aria-current="page"`) | `<nav class="rr-tabbar" aria-label="Main"><a class="rr-tabbar__tab" href="/today" aria-current="page">Today</a>…</nav>` |
| `.rr-row--button` | ListRow as a `<button>` (Path row that opens the detail sheet) | `<button class="rr-row rr-row--button" data-item-id="…" aria-haspopup="dialog">…</button>` |
| `.rr-item` + `__chips/__title/__author/__meta/__why/__note/__actions` | ItemCard (Today card, detail sheet): spacing from the Today board | `<article class="rr-item"><div class="rr-item__chips">…</div><h2 class="rr-item__title rr-display">…</h2>…</article>` |
| `.rr-sheet` + `__inner`, `__head` | Detail sheet: native `<dialog>` + `showModal()`, ground, ink rule on top, column width, safe-area padding; the page under it fades to ground and cannot scroll | `<dialog class="rr-sheet" aria-labelledby="t"><div class="rr-sheet__inner"><div class="rr-sheet__head"><span class="rr-label">Phase 1 · item 3</span><button class="rr-btn rr-btn--link">Close</button></div>…</div></dialog>` |
| `.rr-toast` + `__bar`, `__text`, `__actions`, `__action` | Undo toast: ink bar above the tab bar, on-ink text, 44px actions; `.rr-toast` is the always-present `role="status"` region | `<div class="rr-toast" role="status"><div class="rr-toast__bar"><p class="rr-toast__text">Skipped.</p><div class="rr-toast__actions"><button class="rr-toast__action">Undo</button></div></div></div>` |
| `.rr-skeleton` (`--chip/--title/--short/--button/--rule/--chart`), `.rr-skeleton-group` | Loading: wash blocks, no text, no motion | `<div class="rr-skeleton-group" aria-hidden="true"><span class="rr-skeleton rr-skeleton--title"></span></div>` |
| `.rr-state` | Empty / error / coming-soon block | `<section class="rr-state"><h2 class="rr-display">All done. Nice work.</h2><p class="rr-body-italic">…</p></section>` |
| `.rr-screen__body` | Content under the header (18px gap) | `<header class="rr-header">…</header><div class="rr-screen__body">…</div>` |
| `.rr-meter` | Progress: number block + helper (6px) + outlined bar (8px); followed by `.rr-stat-pair` it gets a 16px gap | `<section class="rr-meter"><div class="rr-stat-split">…</div><p class="rr-stat__helper rr-stat__helper--lg">of 89.3 h in the whole list · 0%</p><div class="rr-progress rr-progress--md rr-progress--outlined" role="progressbar" …>…</div></section>` |
| `.rr-stat-split` | Two stats on one line, bottoms aligned (Hours read left, This week right as `.rr-stat--end`) | `<div class="rr-stat-split"><div class="rr-stat">…</div><div class="rr-stat rr-stat--end">…</div></div>` |
| `.rr-stat__number--noted` + `.rr-stat__note` | Number with an italic note on its baseline (Core completion) | `<p class="rr-stat__number rr-stat__number--lg rr-stat__number--noted">4%<span class="rr-stat__note">1.3 of 29.8 h</span></p>` |
| `.rr-section__action` | Quiet 16px italic link at the right of a `.rr-section__head` ("Edit target"); 44px hit area without making the head taller | `<button class="rr-btn rr-btn--link rr-section__action">…Edit target</button>` |
| `.rr-chart--week`, `.rr-chart--layers` | Gap between a section head and its chart (8 / 10px) | `<svg class="rr-chart rr-chart--week" …>` |
| `.rr-tally-list` | List of `.rr-tally` rows (Done by priority), 4px under the label | `<ul class="rr-list rr-tally-list"><li class="rr-tally"><span class="rr-core">Core</span><span><strong>0</strong> of 43 items</span></li></ul>` |
| `.rr-target-form`, `.rr-field` (`__label`, `__error`), `.rr-input` | Not on the boards. Inline form that replaces "Edit target": labelled 44px field (18px text, no iOS zoom), Save (`--primary`), Cancel (`--link`), italic ink error line (`role="alert"`, input `aria-invalid` + heavier border) | `<form class="rr-target-form"><div class="rr-field"><label class="rr-field__label" for="t">Weekly target (hours)</label><input id="t" class="rr-input" inputmode="decimal"></div><button class="rr-btn rr-btn--primary">Save</button><button type="button" class="rr-btn rr-btn--link">Cancel</button></form>` |
| `.rr-login` + `__actions`; `.rr-field__input` | Sign-in form (not in the boards, built from the checklist): label like `.rr-label` (scoped under `.rr-login`), text field 48px tall with an ink-2 hairline under (no box), ink focus outline, italic ink error line (`.rr-field__error`, `role="alert"`). Shares `.rr-field` with the Progress target form. | `<form class="rr-login"><div class="rr-field"><label class="rr-field__label" for="pw">Password</label><input class="rr-field__input" id="pw" type="password" autocomplete="current-password"><p class="rr-field__error" role="alert">That password is not right. Try again.</p></div><div class="rr-login__actions"><button class="rr-btn rr-btn--primary">Enter</button></div></form>` |
| `.rr-print`, `.rr-item__print` | Not on the boards. Quiet Print entry point (SPEC §7.4): ink-2 italic 15px text link with the thin `PrinterIcon`, no underline (hairline underline on hover), 44px hit area; on the Today card and in the detail sheet it sits on its own line under the actions, icon aligned with Open source | `<p class="rr-item__print"><a class="rr-print" href="/print/…?from=today"><svg …/>Print</a></p>` |
| `.rr-row-item`, `.rr-print-icon` | Not on the boards. Path row with a Print icon: the `<li>` holds the row `<button>` and an icon-only link side by side (a link cannot sit in a button); the hairline moves to the `<li>`. Icon link 44 x 44, ink-2, 16px printer drawn with a CSS mask (no SVG per row), pulled 10px into the gutter, on the status-chip line | `<li class="rr-row-item"><button class="rr-row rr-row--button" …>…</button><a class="rr-print-icon" href="/print/…?from=path" aria-label="Print The Bitter Lesson"></a></li>` |
| `.rr-print-state__actions` | Not on the boards. Print page states (open PDF, error, not found): primary button + quiet back link on one wrapping line, inside `.rr-state` | `<div class="rr-print-state__actions"><a class="rr-btn rr-btn--primary" href="…" target="_blank">Open PDF</a><a class="rr-btn rr-btn--link" href="/path">Back to Path</a></div>` |
| `.rr-sr-only` | Text for screen readers only | `<span class="rr-sr-only"> (opens in a new tab)</span>` |
| Type | `.rr-display .rr-author .rr-body .rr-body-italic .rr-meta (+.rr-meta-line, .rr-sep) .rr-meta-italic .rr-row-title .rr-phase-title .rr-axis` | `<h1 class="rr-display">The Bitter Lesson</h1>` |

```html
<!-- ListRow (Path: meta, dotted leader, status chip. Up next: meta + .rr-chip, no leader) -->
<ol class="rr-list"><li><a class="rr-row" href="#">
  <span class="rr-row__order">03</span>
  <span class="rr-row__body">
    <span class="rr-row__title">Deep Learning Is Hitting a Wall</span>
    <span class="rr-row__line"><span class="rr-row__meta">30 min</span><span class="rr-row__leader" aria-hidden="true"></span><span class="rr-status rr-status--todo">To read</span></span>
  </span></a></li></ol>

<!-- PhaseBlock -->
<section class="rr-phase" aria-label="Phase 1">
  <button class="rr-phase__toggle" type="button" aria-expanded="true" aria-controls="phase-1">
    <span class="rr-phase__head"><span class="rr-phase-title">Phase 1</span><span class="rr-phase__now">Now</span>
      <span class="rr-phase__chevron"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M4.5 7l4.5 4.5L13.5 7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span></span>
    <span class="rr-phase__line"><span class="rr-phase__count">4 of 13 items done</span><span class="rr-phase__hours">2.1 <span class="rr-phase__of">of</span> 6.6 h</span></span>
    <span class="rr-progress rr-progress--sm" aria-hidden="true"><span class="rr-progress__fill" style="width:31.7%"></span></span>
  </button>
  <ol class="rr-list rr-list--ruled" id="phase-1">…rows…</ol>
</section>
```

Icons: thin inline SVG (stroke 1.4-1.6) with `stroke="currentColor"` and `aria-hidden="true"`.

## Charts (inline SVG, `.rr-chart`)

- Colour only through `.rr-chart__*` classes (no colour attributes in markup). `role="img"` and a full `aria-label` that says the numbers in words. Text 13px minimum (ticks 14, axis 13).
- **WeekBars** (342 x 182 at 390): 8 slots of 342/8; bar width 23-24, centred. Baseline at y 142.5; y = 142 - hours x scale (20px per hour for a 5 h target; keep target x 1.4 inside the plot). Past weeks hatched + 1px ink outline, this week solid ink. Value above past bars (6px gap, ink-2), inside the current bar in `--on-ink`. Empty weeks draw no bar, only "0". Ticks: Monday date at y 160, month italic at y 176; current week ink 700. Dashed target line `5 4`, label "Target 5 h" right-aligned 8px above; if bars or values at the right end reach that spot, the label goes left-aligned at x 0 instead (`placeTargetLabel` in `lib/charts.ts`).
- **LayerBars** (342 wide, 48px per row): label + "done of total h" at baseline 16, track 10px at y 24 (`.rr-chart__track`, rx 1), done fill on top (`.rr-chart__fill`). Track length is proportional to the layer total (largest = full width).

```html
<svg class="rr-chart" viewBox="0 0 342 182" role="img" aria-label="Hours read per week, last 8 weeks, target 5 hours. …">
  <defs><pattern id="rr-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect class="rr-chart__hatch-bg" width="5" height="5"/><line class="rr-chart__hatch-line" x1="0" y1="0" x2="0" y2="5"/>
  </pattern></defs>
  <line class="rr-chart__target" x1="0" y1="42" x2="342" y2="42"/>
  <text class="rr-chart__target-label" x="342" y="34" text-anchor="end">Target 5 h</text>
  <rect class="rr-chart__bar--past" x="266.4" y="124.5" width="23" height="17.5"/>
  <rect class="rr-chart__bar--current" x="308.6" y="118" width="24" height="24"/>
  <line class="rr-chart__baseline" x1="0" y1="142.5" x2="342" y2="142.5"/>
</svg>
<p class="rr-chart__caption">Weeks start on Monday. Solid bar: this week.</p>
```

One pattern id per page: if two charts need hatching, give each its own id and set `fill="url(#id)"` on the bar.

## Adding a component that is not in the designs

- [ ] Tokens only: no hex, no new colour or tint, no new hue. Text in `ink` or `ink-2`, never `rule`.
- [ ] Hairline rules (`rule`, 1px) to separate; no boxes, cards, shadows or gradients.
- [ ] Tap targets at least 44px (`--rr-tap-min`).
- [ ] Radius 6px (`--rr-radius-md`) unless it is a bar end or chart track.
- [ ] Status never by colour alone: add a word, shape, check, dot, dash or strike.
- [ ] Text 14px minimum (13px only for chart ticks), weights 500-700.
- [ ] Serif only (`--rr-font-serif`); italic for authors and helpers; uppercase tracked labels.
- [ ] Visible `:focus-visible` (ink outline comes from `components.css`); motion off under `prefers-reduced-motion`.
- [ ] UI copy in simple English (B1), short labels.
- [ ] Add the class to `components.css` with the `rr-` prefix and a row to the table above.

## Print screen (`print.css`)

Loaded only by `components/print/PrintClient.tsx` (the print page), never by Today, Path or Progress. Its fonts (Inter, Lora, JetBrains Mono, from `components/print/fonts.ts`) load only there too.

| Class | Use |
|---|---|
| `.rr-print-link` + `__chrome`, `__nav`, `__back`, `__intro`, `__title`, `__ready`, `__preview` | Page shell: chrome in the 480 column, preview up to A4 width (never a horizontal scroll) |
| `.rr-print-notice` (+ `__list`, `__actions`) | Status notice: `.rr-section` with an ink label (paywalled, too short, blocked, warnings) |
| `.rr-print-check__line`, `.rr-print-check__fail` | Check line; a failed page check is bold ink with an ink bar on the left (not colour only) |
| `.rr-print-controls`, `.rr-print-field` (`__label`, `__unit`, `__row`), `.rr-print-range`, `.rr-print-number`, `.rr-print-select`, `.rr-print-seg` (`__options`, `__option`), `.rr-print-checkbox` (`__note`) | Print options: 44px range, field, select, segmented radio group (chosen = ink fill + check mark), checkbox row |
| `.rr-print-go` | Print button + tip |
| `.rr-print-pages`, `.rr-print-page` (`--flow`), `__frame`, `__caption`, `.rr-print-preview__status` | Preview: A4 sheets scaled to the screen (`--rr-print-scale`), "Page 2 of 7" under each sheet (not printed) |
| `.rr-print-imgtoggle` (`--restore`) | "Remove image" / "Restore image" on a preview image: scaled back up to a real 44px target, not printed |

**Print document: paper output, not UI.** The printed sheet (`.rr-print-sheet` and everything in it: `.rr-print-block`, `.rr-print-dochead`, `.rr-print-docfoot`, `.rr-print-note`, `.rr-print-code`, `.rr-print-table`, `.rr-print-figure`, ...) is what comes out of the printer, so it is black ink on white paper, not the two-colour UI. It uses its own variables, defined once on `.rr-print-sheet` in `print.css`: `--rr-print-paper` (white), `--rr-print-ink` (black), `--rr-print-ink-2` (dark grey), `--rr-print-rule` (grey rules), `--rr-print-wash` (code background). These are the only colour literals outside `tokens.css`, and only paper may use them; every UI element (chrome, captions, buttons) stays on the normal tokens. The preview sheets use the same variables, so the preview looks like the paper. Formats: Default (Lora text, Inter headings) and Monospace (JetBrains Mono, typewriter draft), switched by `data-format` / `data-font` on `.rr-print-doc`.
