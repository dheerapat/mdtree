import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { countTokens } from "../src/utils.ts";

const content = readFileSync("test/cognitive-load.md", "utf-8");
const lines = content.split("\n");

describe("countTokens", () => {
  test("should count tokens for Intrinsic Load section", () => {
    const text = lines
      .slice(13, 17)
      .join("\n")
      .trim();
    const tokens = countTokens(text);
    expect(tokens).toBeGreaterThan(20);
    expect(tokens).toBeLessThan(50);
  });

  test("should count tokens for Extraneous Load section", () => {
    const text = lines
      .slice(18, 22)
      .join("\n")
      .trim();
    const tokens = countTokens(text);
    expect(tokens).toBeGreaterThan(20);
    expect(tokens).toBeLessThan(50);
  });

  test("should count tokens for Germane Load section", () => {
    const text = lines
      .slice(23, 27)
      .join("\n")
      .trim();
    const tokens = countTokens(text);
    expect(tokens).toBeGreaterThan(20);
    expect(tokens).toBeLessThan(50);
  });

  test("should count tokens for Chunking section", () => {
    const text = lines
      .slice(32, 36)
      .join("\n")
      .trim();
    const tokens = countTokens(text);
    expect(tokens).toBeGreaterThan(15);
    expect(tokens).toBeLessThan(40);
  });

  test("should count tokens for Worked Examples section", () => {
    const text = lines
      .slice(37, 41)
      .join("\n")
      .trim();
    const tokens = countTokens(text);
    expect(tokens).toBeGreaterThan(20);
    expect(tokens).toBeLessThan(50);
  });

  test("should return 0 for empty string", () => {
    const tokens = countTokens("");
    expect(tokens).toBe(0);
  });

  test("should handle multi-line text correctly", () => {
    const multiLineText = `Line one\nLine two\nLine three`;
    const tokens = countTokens(multiLineText);
    expect(tokens).toBeGreaterThan(0);
  });
});
