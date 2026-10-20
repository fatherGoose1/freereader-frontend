import assert from "node:assert/strict";
import { test } from "node:test";
import { READING_BACKGROUNDS } from "./readingAppearance";

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(foreground: string, background: string): number {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("each reading theme keeps body, selection and spoken word text readable", () => {
  for (const [name, theme] of Object.entries(READING_BACKGROUNDS)) {
    assert.ok(contrast(theme.text, theme.background) >= 4.5, `${name} body`);
    assert.ok(contrast(theme.currentText, theme.current) >= 4.5, `${name} current passage`);
    assert.ok(contrast(theme.wordText, theme.word) >= 4.5, `${name} spoken word`);
  }
});
