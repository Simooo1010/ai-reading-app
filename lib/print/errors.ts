// Typed errors for the Print fetch layer (SPEC §7.4).
//
// `message` is for server logs; `userMessage` is short B1 English that can be
// shown to Marcus. Neither ever contains an IP address or other internals.

export type PrintFetchErrorCode =
  | "blocked-address"
  | "bad-url"
  | "bad-scheme"
  | "too-many-redirects"
  | "timeout"
  | "too-large"
  | "http-status"
  | "network"
  | "unsupported-content-type";

const USER_MESSAGES: Record<PrintFetchErrorCode, string> = {
  "blocked-address": "This link points to an address the app is not allowed to open.",
  "bad-url": "This link is not a valid web address.",
  "bad-scheme": "Only web links (http or https) can be printed.",
  "too-many-redirects": "This page sends us to too many other pages. Open the source instead.",
  timeout: "The page took too long to load. Please try again later.",
  "too-large": "This page is too big to print here. Open the source instead.",
  "http-status": "The website did not give us the page.",
  network: "We could not reach the website. Please try again later.",
  "unsupported-content-type": "This link is not a web page or a PDF, so it cannot be printed.",
};

/** Messages for the HTTP statuses the paywall logic cares about. */
function statusUserMessage(status: number): string {
  if (status === 401) return "This page needs a login. Open the source instead.";
  if (status === 402) return "This page is behind a paywall. Open the source instead.";
  if (status === 403) return "The website does not allow us to read this page. Open the source instead.";
  if (status === 404 || status === 410) return "This page no longer exists.";
  if (status === 429) return "The website is busy. Please try again later.";
  if (status >= 500) return "The website has a problem right now. Please try again later.";
  return USER_MESSAGES["http-status"];
}

export class PrintFetchError extends Error {
  readonly code: PrintFetchErrorCode;
  readonly userMessage: string;
  /** HTTP status for code 'http-status' (e.g. 401, 402, 403, 404). */
  readonly status?: number;

  constructor(code: PrintFetchErrorCode, message: string, opts: { status?: number; cause?: unknown } = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "PrintFetchError";
    this.code = code;
    this.status = opts.status;
    this.userMessage = code === "http-status" && opts.status !== undefined ? statusUserMessage(opts.status) : USER_MESSAGES[code];
  }
}

export function isPrintFetchError(e: unknown): e is PrintFetchError {
  return e instanceof PrintFetchError;
}
