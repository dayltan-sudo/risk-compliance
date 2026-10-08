import { describe, it, expect } from "vitest";
import { parseNumberInput } from "./parseNumber.js";

describe("parseNumberInput", () => {
  it.each([
    ["", null],
    ["   ", null],
    ["abc", null],
    ["Infinity", null],
    ["1e999", null],
    ["0", 0],
    ["2010", 2010],
    [" 12.5 ", 12.5],
    ["-3", -3],
  ])("%j -> %j", (input, expected) => {
    expect(parseNumberInput(input)).toBe(expected);
  });
});
