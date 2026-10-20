import type { CSSProperties } from "react";

export const READING_BACKGROUNDS = {
  white: { label: "White", background: "#ffffff", text: "#3d4655", heading: "#283448", current: "#edf2ff", currentText: "#254895", hover: "#f4f6fc", word: "#aabaff", wordText: "#172f73" },
  cream: { label: "Warm Cream", background: "#fff3df", text: "#382f28", heading: "#302820", current: "#ead9ba", currentText: "#302820", hover: "#f7e7ca", word: "#dfc98f", wordText: "#302820" },
  yellow: { label: "Soft Yellow", background: "#fff8ce", text: "#353020", heading: "#292617", current: "#eee3a3", currentText: "#292617", hover: "#f7ebaf", word: "#e5d78b", wordText: "#292617" },
  blue: { label: "Light Blue", background: "#e8f2ff", text: "#29394f", heading: "#213149", current: "#c9dbf5", currentText: "#203559", hover: "#d9e8fc", word: "#adcaef", wordText: "#203559" },
  green: { label: "Soft Green", background: "#e9f5e7", text: "#293e30", heading: "#203428", current: "#cde8ca", currentText: "#24402b", hover: "#dcf0d9", word: "#b8dcae", wordText: "#24402b" },
  dark: { label: "Dark Mode", background: "#1d2430", text: "#f2f4fa", heading: "#ffffff", current: "#334760", currentText: "#ffffff", hover: "#2b394b", word: "#4d6687", wordText: "#ffffff" },
} as const;

export type ReadingBackground = keyof typeof READING_BACKGROUNDS;

export function readingColors(background: ReadingBackground) {
  const colors = READING_BACKGROUNDS[background];
  return {
    "--reading-background": colors.background,
    "--reading-text": colors.text,
    "--reading-heading": colors.heading,
    "--reading-current": colors.current,
    "--reading-current-text": colors.currentText,
    "--reading-hover": colors.hover,
    "--reading-word": colors.word,
    "--reading-word-text": colors.wordText,
  } as CSSProperties;
}
