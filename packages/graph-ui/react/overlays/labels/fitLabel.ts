export interface FittedLabel {
  lines: string[];
  fontPx: number;
  lineHeight: number;
}

export function fitLabelInBox(
  ctx: CanvasRenderingContext2D,
  rawText: string,
  maxWidth: number,
  maxHeight: number,
  fontFamily: string,
  fontWeight: number,
  baseFontPx: number,
  minFontPx: number,
  dpr: number,
): FittedLabel | null {
  const text = normalizeLabel(rawText);
  if (!text) return null;

  const step = Math.max(0.5, 0.5 * dpr);
  for (let fontPx = baseFontPx; fontPx >= minFontPx - 0.01; fontPx -= step) {
    ctx.font = `${fontWeight} ${fontPx}px ${fontFamily}`;
    const lineHeight = Math.max(fontPx * 1.16, fontPx + 1 * dpr);
    const maxLines = Math.max(1, Math.min(4, Math.floor(maxHeight / lineHeight)));
    if (maxLines < 1) continue;
    const lines = wrapIntoLines(ctx, text, maxWidth, maxLines);
    if (lines.length === 0) continue;
    if (lines.length * lineHeight <= maxHeight + 0.5 * dpr) {
      return { lines, fontPx, lineHeight };
    }
  }

  ctx.font = `${fontWeight} ${minFontPx}px ${fontFamily}`;
  const lineHeight = Math.max(minFontPx * 1.16, minFontPx + 1 * dpr);
  if (lineHeight > maxHeight) return null;
  return {
    lines: [ellipsize(ctx, text, maxWidth)],
    fontPx: minFontPx,
    lineHeight,
  };
}

function wrapIntoLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const chars = Array.from(text);
  const lines: string[] = [];
  let start = 0;

  while (start < chars.length && lines.length < maxLines) {
    const hardEnd = fitChars(ctx, chars, start, maxWidth);
    if (hardEnd <= start) break;
    let end = hardEnd;
    if (hardEnd < chars.length) {
      const softEnd = findSoftBreak(chars, start, hardEnd);
      if (softEnd > start + 1) end = softEnd;
    }

    const line = chars.slice(start, end).join("").trim();
    start = end;
    while (start < chars.length && chars[start] === " ") start++;
    if (!line) continue;
    lines.push(line);
  }

  if (!lines.length) return [];
  if (start < chars.length) {
    const remaining = chars.slice(start).join("").trim();
    const tail = remaining
      ? `${lines[lines.length - 1]} ${remaining}`
      : lines[lines.length - 1];
    lines[lines.length - 1] = ellipsize(ctx, tail, maxWidth);
  }
  return lines;
}

function fitChars(
  ctx: CanvasRenderingContext2D,
  chars: string[],
  start: number,
  maxWidth: number,
): number {
  let best = start;
  for (let i = start + 1; i <= chars.length; i++) {
    const chunk = chars.slice(start, i).join("");
    if (ctx.measureText(chunk).width > maxWidth) break;
    best = i;
  }
  return best;
}

function findSoftBreak(chars: string[], start: number, hardEnd: number): number {
  for (let i = hardEnd; i > start; i--) {
    if (isBreakChar(chars[i - 1])) return i;
  }
  return hardEnd;
}

function isBreakChar(ch: string): boolean {
  return ch === " " || ch === "/" || ch === "\\" || ch === "_" || ch === "-" || ch === "." || ch === ":";
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  const ell = "...";
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid) + ell).width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + ell;
}

function normalizeLabel(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}
