import type { ReactNode, SVGProps } from "react";

type Name = "arrow" | "back" | "plus" | "book" | "calendar" | "users" | "copy" | "link" | "check" | "chevron" | "upload" | "settings" | "more" | "edit" | "close" | "clock";

export default function UiIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: Name }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const, ...props };
  const paths: Record<Name, ReactNode> = {
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6" /></>,
    back: <><path d="M19 12H5m6 6-6-6 6-6" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    book: <><path d="M12 6.5C9.5 5 6 4.6 3 5.4v13c3-.8 6.5-.4 9 1.1 2.5-1.5 6-1.9 9-1.1v-13c-3-.8-6.5-.4-9 1.1Z" /><path d="M12 6.5v13" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18" /></>,
    users: <><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m15-10a4 4 0 0 1 0 8m5 2v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" /></>,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7 .2l2-2a5 5 0 0 0-7-7l-1.1 1.1m2.1 5.7a5 5 0 0 0-7-.2l-2 2a5 5 0 0 0 7 7l1.1-1.1" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m6 9 6 6 6-6" />,
    upload: <><path d="M12 16V4m-5 5 5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></>,
    settings: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="2" fill="white" /><circle cx="16" cy="17" r="2" fill="white" /></>,
    more: <><circle cx="5" cy="12" r="1.25" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.25" fill="currentColor" stroke="none" /></>,
    edit: <><path d="m15 5 4 4M4 20l4.5-1 11-11a2 2 0 0 0-4-4l-11 11L4 20Z" /></>,
    close: <path d="M5 5 19 19M19 5 5 19" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}
