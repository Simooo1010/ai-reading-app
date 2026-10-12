// Colours for files that cannot read CSS variables: the web app manifest,
// the generated app icons (next/og) and the theme-color meta tag.
//
// These are the ONLY copies of the Reading Room colours outside
// design-system/tokens.css (documented exception in design-system/README.md).
// They must equal the tokens; tests/app-colors.test.ts checks this.
//
// The manifest (background_color, theme_color) and the generated icons hold
// ONE value, so they use the light pair and stay as they are in dark mode.
// Only the theme-color meta tag (app/layout.tsx) has a dark value.

/** = --rr-ground (page background, cream). */
export const APP_GROUND = "#FCF3DC";

/** = --rr-ink (text and marks, deep maroon). */
export const APP_INK = "#500101";

/** = --rr-ground in the dark theme (maroon). Only for the dark theme-color meta tag. */
export const APP_GROUND_DARK = "#500101";
