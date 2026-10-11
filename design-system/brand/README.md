# Brand mark

The app icon is a filled ink brain (side view, facing right) on the ground colour. It uses only the two design-system colours: ink `#500101` and ground `#FCF3DC`.

## Files

| File | Use |
|---|---|
| `public/icons/mark.svg` | Master mark. Brain is about 55% of the width, centred, full-bleed ground. Shown on the sign-in screen. |
| `public/icons/icon-192.png`, `icon-512.png` | Web app manifest icons (`app/manifest.ts`). Exported from `mark.svg`. |
| `app/apple-icon.png` | iPhone home screen icon, 180 x 180. Exported from `mark.svg`. iOS adds the rounded corners. |
| `app/icon.svg`, `app/favicon.ico` | Browser tab. A small-size cut of the same drawing: bigger brain (about 90% of the width), fewer and bolder fold lines, so it still reads at 16 px. `favicon.ico` holds 16, 32 and 48 px. |

## Source and licence

The drawing is "Brain Profile Illustration Line Art" from Openclipart (via FreeSVG, https://freesvg.org/1548373695), marked Public Domain (CC0). Changes: outline filled with ink, fold lines redrawn in ground colour, mirrored, brain stem removed, lower edge of the cerebellum redrawn as a smooth curve.

## Changing the mark

Edit `public/icons/mark.svg` (and `app/icon.svg` for the small cut), then export the PNGs and the `.ico` again at the sizes above. Keep the two colours; do not add a third.
