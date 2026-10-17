// Tag masking for "Print in Italian" (SPEC.md §7.4, Italian).
// Server side only. Pure functions, no I/O.
//
// The translator must never see (or break) HTML. Before a segment is sent,
// its tags become numbered markers around the same words:
//   <a href="…">link</a>   ->  ⟦1⟧link⟦/1⟧
//   <br />                 ->  ⟦2/⟧
//   <math>…</math>         ->  ⟦3/⟧   (opaque: math, code, kbd, samp, var, svg, pre stay as they are)
// Entities are decoded first, so the translator works on plain text; the
// text parts are escaped again when the markers are turned back into tags.
// unmaskHtml() accepts a translation only when every marker comes back
// exactly once and pairs are still properly nested; otherwise it returns
// null and the segment stays English (counted as not translated).

export type MaskTag = { kind: "pair"; open: string; close: string } | { kind: "self"; html: string };

export interface MaskedHtml {
  /** What the translator sees: plain text with ⟦n⟧ ⟦/n⟧ ⟦n/⟧ markers. */
  text: string;
  /** Markup per marker id (id n is tags[n - 1]). */
  tags: MaskTag[];
}

export const MARK_OPEN = "⟦";
export const MARK_CLOSE = "⟧";

/** Tags kept whole, never translated inside (formulas, code, keys, drawings). */
const OPAQUE = new Set(["math", "code", "kbd", "samp", "var", "svg", "pre"]);

/** Elements with no end tag. */
const VOID = new Set(["br", "wbr", "img", "hr", "col", "area", "source", "track", "input", "meta", "link", "base"]);

/** Entities that can still appear in sanitized HTML (sanitize-html decodes most of them). */
const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
  times: "×",
  divide: "÷",
  middot: "·",
  bull: "•",
  shy: "­",
  thinsp: " ",
  ensp: " ",
  emsp: " ",
  zwj: "‍",
  zwnj: "‌",
};

// A comment, a tag (start, end or self-closing), a text run, or a stray "<".
const TOKEN_RE = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9:-]*)(?:\s[^>]*)?\/?>|[^<]+|</g;
// Entities in a text run, and the marker brackets (they must never appear as text).
const TEXT_PART_RE = /&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);|[⟦⟧]/g;
// Tolerant marker: translators sometimes add spaces inside ("⟦ /1 ⟧").
const MARKER_RE = /⟦\s*(\/?)\s*(\d+)\s*(\/?)\s*⟧/g;

/** Plain text -> safe HTML text. */
export function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function decodeEntity(body: string): string | null {
  if (body[0] === "#") {
    const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return null;
    return String.fromCodePoint(code);
  }
  return Object.prototype.hasOwnProperty.call(NAMED, body) ? NAMED[body] : null;
}

/** HTML string -> masked text + markup table. Never throws. */
export function maskHtml(html: string): MaskedHtml {
  const out: string[] = [];
  const tags: MaskTag[] = [];
  const stack: { id: number; name: string }[] = [];
  let opaque: { name: string; depth: number; raw: string[] } | null = null;

  const addSelf = (raw: string) => {
    tags.push({ kind: "self", html: raw });
    out.push(`${MARK_OPEN}${tags.length}/${MARK_CLOSE}`);
  };
  const closeTop = (closeRaw: string) => {
    const top = stack.pop();
    if (!top) return;
    const tag = tags[top.id - 1];
    if (tag.kind === "pair") tag.close = closeRaw || `</${top.name}>`;
    out.push(`${MARK_OPEN}/${top.id}${MARK_CLOSE}`);
  };
  const addText = (text: string) => {
    let last = 0;
    TEXT_PART_RE.lastIndex = 0;
    for (let m = TEXT_PART_RE.exec(text); m !== null; m = TEXT_PART_RE.exec(text)) {
      if (m.index > last) out.push(text.slice(last, m.index));
      last = m.index + m[0].length;
      if (m[1] === undefined) {
        addSelf(escapeText(m[0])); // a literal ⟦ or ⟧ in the source
        continue;
      }
      const decoded = decodeEntity(m[1]);
      if (decoded === null) addSelf(m[0]); // unknown entity: kept as it is
      else out.push(decoded);
    }
    if (last < text.length) out.push(text.slice(last));
  };

  TOKEN_RE.lastIndex = 0;
  for (let m = TOKEN_RE.exec(html); m !== null; m = TOKEN_RE.exec(html)) {
    const raw = m[0];
    const name = m[1]?.toLowerCase();
    const isTag = name !== undefined;
    const isEnd = isTag && raw[1] === "/";
    const selfClosing = isTag && !isEnd && raw.endsWith("/>");

    if (opaque) {
      opaque.raw.push(raw);
      if (isTag && name === opaque.name && !selfClosing) opaque.depth += isEnd ? -1 : 1;
      if (opaque.depth === 0) {
        addSelf(opaque.raw.join(""));
        opaque = null;
      }
      continue;
    }
    if (raw.startsWith("<!--")) continue;
    if (!isTag) {
      addText(raw);
      continue;
    }
    if (isEnd) {
      let at = -1;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].name === name) {
          at = i;
          break;
        }
      }
      if (at < 0) continue; // stray end tag: dropped
      while (stack.length > at + 1) closeTop("");
      closeTop(raw);
      continue;
    }
    if (OPAQUE.has(name)) {
      if (selfClosing) addSelf(raw);
      else opaque = { name, depth: 1, raw: [raw] };
      continue;
    }
    if (VOID.has(name) || selfClosing) {
      addSelf(raw);
      continue;
    }
    tags.push({ kind: "pair", open: raw, close: `</${name}>` });
    stack.push({ id: tags.length, name });
    out.push(`${MARK_OPEN}${tags.length}${MARK_CLOSE}`);
  }
  if (opaque) addSelf(opaque.raw.join(""));
  while (stack.length > 0) closeTop("");
  return { text: out.join(""), tags };
}

/** The words the translator will see (markers removed). */
export function maskedWords(text: string): string {
  return text.replace(MARKER_RE, " ").replace(/\s+/g, " ").trim();
}

/**
 * Translated masked text -> HTML, or null when the markers did not survive
 * (lost, doubled, unknown, or pairs no longer nested). Text is escaped.
 */
export function unmaskHtml(masked: MaskedHtml, translated: string): string | null {
  const out: string[] = [];
  const seenOpen = new Set<number>();
  const seenClose = new Set<number>();
  const stack: number[] = [];
  let last = 0;

  const pushText = (text: string): boolean => {
    if (text.includes(MARK_OPEN) || text.includes(MARK_CLOSE)) return false; // a broken marker
    out.push(escapeText(text));
    return true;
  };

  MARKER_RE.lastIndex = 0;
  for (let m = MARKER_RE.exec(translated); m !== null; m = MARKER_RE.exec(translated)) {
    if (!pushText(translated.slice(last, m.index))) return null;
    last = m.index + m[0].length;
    const isClose = m[1] === "/";
    const isSelf = m[3] === "/";
    const id = Number(m[2]);
    const tag = masked.tags[id - 1];
    if (!tag || (isClose && isSelf)) return null;
    if (isSelf) {
      if (tag.kind !== "self" || seenOpen.has(id)) return null;
      seenOpen.add(id);
      out.push(tag.html);
    } else if (isClose) {
      if (tag.kind !== "pair" || seenClose.has(id) || stack[stack.length - 1] !== id) return null;
      stack.pop();
      seenClose.add(id);
      out.push(tag.close);
    } else {
      if (tag.kind !== "pair" || seenOpen.has(id)) return null;
      seenOpen.add(id);
      stack.push(id);
      out.push(tag.open);
    }
  }
  if (!pushText(translated.slice(last))) return null;
  if (stack.length > 0) return null;
  for (let id = 1; id <= masked.tags.length; id++) {
    if (!seenOpen.has(id)) return null;
    if (masked.tags[id - 1].kind === "pair" && !seenClose.has(id)) return null;
  }
  return out.join("");
}

/**
 * A translation is not usable when it is empty or absurdly long for its
 * source (a model that explains, repeats or runs away).
 */
export function isSaneLength(source: string, translated: string): boolean {
  if (!translated.trim()) return false;
  return translated.length <= source.length * 3 + 200;
}
