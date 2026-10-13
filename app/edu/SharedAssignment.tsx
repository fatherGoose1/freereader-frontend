"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEdu } from "./EduProvider";
import { sharedFetch } from "./sharedClient";
import AssignmentReader from "./AssignmentReader";
import type { Assignment, DocumentVersion } from "./model";
import styles from "./edu.module.css";
import UiIcon from "./UiIcon";

export default function SharedAssignment({ token, versionId }: { token: string; versionId?: string }) {
  const { path } = useEdu();
  const overview = useSearchParams().get("overview") === "1";
  const [data, setData] = useState<{ assignment: Assignment; documents: DocumentVersion[]; school: { name: string } } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void sharedFetch<{ assignment: Assignment; documents: DocumentVersion[]; school: { name: string } }>(`shared/${token}`, { signal: controller.signal }).then((data) => {
      if (controller.signal.aborted) return;
      setData(data);
    }).catch((error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [token, versionId]);
  const version = data?.documents.find((doc) => doc.id === versionId) ?? (!versionId && !overview ? data?.documents[0] : undefined);
  if (data && version) return <AssignmentReader key={versionId} shareToken={token} assignment={data.assignment} version={version} documents={data.documents} />;
  return <div className={`${styles.app} ${styles.publicLanding}`}><main className={styles.main}><div className={styles.breadcrumbs}><span>FreeReader EDU</span><UiIcon name="chevron" /><span>Reading</span></div><section className={styles.card}>{error ? <p role="alert" className={styles.error}>{error}</p> : data ? <><span className={styles.eyebrow}>{data.school.name}</span><h1>{data.assignment.title}</h1>{data.assignment.instructions && <p className={styles.muted} style={{ whiteSpace: "pre-wrap" }}>{data.assignment.instructions}</p>}<ul className={styles.readingList}>{data.documents.map((doc) => <li key={doc.id}><span className={styles.readingFile}><UiIcon name="book" /></span><span className={styles.readingFileInfo}><strong>{doc.title}</strong><small>{doc.format.toUpperCase()} · Read or listen</small></span><Link className={styles.primary} href={path(`shared/${token}/reader/${doc.id}`)}>Open reader <UiIcon name="arrow" /></Link></li>)}</ul></> : <p role="status">Opening your reading…</p>}</section></main></div>;
}
