/** Form text -> number. A blank or non-numeric entry is `null`, never 0:
 * `Number("")` is 0, which silently saved a $0 / year-0 value. */
export function parseNumberInput(text: string): number | null {
  if (text.trim() === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}
