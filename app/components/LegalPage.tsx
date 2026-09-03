import type { ReactNode } from "react";

type LegalPageProps = {
  title: string;
  updated: string;
  intro: ReactNode;
  children: ReactNode;
};

export function LegalPage({ title, updated, intro, children }: LegalPageProps) {
  return (
    <main className="wrap legal">
      <span className="eyebrow">Legal</span>
      <h1>{title}</h1>
      <p className="date">Effective {updated}</p>
      <p>{intro}</p>
      {children}
    </main>
  );
}
