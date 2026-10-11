# Brand mark

The app icon is a filled ink brain (side view, facing right) on the ground colour. Only the two design-system colours: ink `#500101` and ground `#FCF3DC` (hex lives once in `lib/app-colors.ts`).

## Where it is used

| Where | File | Notes |
|---|---|---|
| The drawing | `lib/brain-mark.ts` | One source. `brainMarkSvg()` and `brainMarkDataUri()`. No background. |
| iPhone home screen, web app manifest icons | `app/apple-icon.tsx`, `app/icon.tsx` via `components/AppIconMark.tsx` | The brain is 54.6% of the icon width, centred on the ground. Generated at build time (`next/og`). Sizes and scale: `lib/app-icons.ts`. |
| Sign-in screen | `components/BrandMark.tsx` (`.rr-mark`) | 96px wide above the form. |
| Browser tab | `app/favicon.ico` (16, 32, 48 px) | A small-size cut of the same drawing: bigger brain (about 90% of the width), fewer and bolder fold lines, so it still reads at 16 px. A static file; to change it, redraw it from `lib/brain-mark.ts` and export again. |

## Source and licence

The drawing is "Brain Profile Illustration Line Art" from Openclipart (via FreeSVG, https://freesvg.org/1548373695), marked Public Domain (CC0). Changes: outline filled with ink, fold lines redrawn in ground colour, mirrored, brain stem removed, lower edge of the cerebellum redrawn as a smooth curve.

## Changing the mark

Change `lib/brain-mark.ts` (icons and the sign-in mark follow), then redo `app/favicon.ico`. Keep the two colours; do not add a third.
