// Stand-in for next/font/google in the fixture harness (vitest has no Next.js
// font compiler). Gives the same shape: className, variable, style.fontFamily.
type Opts = { variable?: string };

function font(family: string) {
  return (opts: Opts = {}) => ({
    className: `stub-font-${family.toLowerCase().replace(/\s+/g, "-")}`,
    variable: opts.variable ? `stub-var-${opts.variable.replace(/^--/, "")}` : "",
    style: { fontFamily: `'${family}'` },
  });
}

export const Inter = font("Inter");
export const Lora = font("Lora");
export const JetBrains_Mono = font("JetBrains Mono");
export const Newsreader = font("Newsreader");
