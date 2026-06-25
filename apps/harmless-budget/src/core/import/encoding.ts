const MOJIBAKE_PATTERN = /Ã[\x80-\xBF]|â€|Â[\x80-\xBF]/;
const LATIN1_EXTENDED_PATTERN = /[\u0080-\u00FF]/;

/**
 * Heuristic encoding detection for CSV text already decoded to a JS string.
 * Prefers utf-8 unless latin1-specific byte patterns are present.
 */
export function detectEncoding(text: string): string {
  if (!text) {
    return "utf-8";
  }

  if (text.charCodeAt(0) === 0xfeff) {
    return "utf-8";
  }

  if (text.includes("\uFFFD")) {
    return "latin1";
  }

  if (MOJIBAKE_PATTERN.test(text)) {
    return "latin1";
  }

  if (LATIN1_EXTENDED_PATTERN.test(text)) {
    return "latin1";
  }

  return "utf-8";
}