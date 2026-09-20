import type { SpeechLanguage } from "./speech";

export type DocumentFormat = "epub" | "pdf" | "txt" | "docx" | "html" | "md";

export interface TextBlock {
  index: number;
  text: string;
  chapterIndex: number;
  isHeading: boolean;
  page?: number;
}

export interface Chapter {
  title: string;
  startBlockIndex: number;
}

export interface ReadingPosition {
  blockIndex: number;
  offsetSeconds: number;
  speed: number;
  updatedAt?: string;
}

export interface LibraryBook {
  id: string;
  title: string;
  author?: string;
  language?: SpeechLanguage;
  format: DocumentFormat;
  sourceName: string;
  sourceIdentifier?: string;
  parentId?: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  chapters: Chapter[];
  blocks: TextBlock[];
  position: ReadingPosition;
  cover?: Blob;
}

export interface LibraryFolder {
  id: string;
  name: string;
  parentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ParsedBook {
  title: string;
  author?: string;
  language?: SpeechLanguage;
  format: DocumentFormat;
  chapters: Chapter[];
  blocks: TextBlock[];
  cover?: Blob;
}

export interface AccountSyncRecord {
  key: string;
  ownerId: string;
  kind: "document" | "folder";
  itemId: string;
  revision: number;
  contentUpdatedAt: string;
  syncedAt: string;
}

export interface GutenbergBook {
  id: string;
  title: string;
  author?: string;
  detailUrl: string;
  coverUrl?: string;
}
