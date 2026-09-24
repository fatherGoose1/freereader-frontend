const paths = {
  book: "M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15",
  upload: "M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5",
  link: "m10 13 4-4m-6 1-3 3a4 4 0 0 0 6 6l3-3m-4-8 3-3a4 4 0 0 1 6 6l-3 3",
  text: "M4 5h16M12 5v15m-4 0h8",
  search: "M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  folder: "M3 7V4h6l3 3h9v13H3Z",
  plus: "M12 5v14M5 12h14",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  back: "M19 12H5m5-5-5 5 5 5",
  play: "m8 4 12 8-12 8Z",
  pause: "M8 5v14M16 5v14",
  next: "m5 5 10 7-10 7ZM19 5v14",
  previous: "m19 5-10 7 10 7ZM5 5v14",
  settings: "M4 7h9m4 0h3M4 17h3m4 0h9M13 4v6M7 14v6",
  close: "m6 6 12 12M6 18 18 6",
  user: "M8 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0M4 21v-3a8 8 0 0 1 16 0v3",
  headphones: "M4 14V11a8 8 0 0 1 16 0v3M4 12H2v8h5v-8Zm16 0h2v8h-5v-8Z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
} as const;

export default function ReaderIcon({ name }: { name: keyof typeof paths }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === "more" ? 3 : 1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
