// A team name along an end band or end zone: upper case, and squeezed to the
// band's length when a long nickname ("GOLDEN KNIGHTS") would overrun it.
// Bold capitals run about 0.7 of the font size wide.
export function fitLabel(text: string, fontSize: number, letterSpacing: number, max: number) {
  const label = text.toUpperCase();
  const width = label.length * (fontSize * 0.7 + letterSpacing);
  return { label, fit: width > max ? { textLength: max, lengthAdjust: "spacingAndGlyphs" as const } : {} };
}
