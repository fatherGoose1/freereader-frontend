"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEdu } from "./EduProvider";
import { sharedFetch } from "./sharedClient";
import AssignmentReader from "./AssignmentReader";
import type { Assignment, DocumentVersion } from "./model";
import styles from "./edu.module.css";

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
  return <main className={styles.main}><section className={styles.card}>{error ? <p role="alert">{error}</p> : data ? <><p className={styles.muted}>{data.school.name}</p><h1>{data.assignment.title}</h1><p style={{ whiteSpace: "pre-wrap" }}>{data.assignment.instructions}</p><div className={styles.row}>{data.documents.map((doc) => <Link className={styles.primary} key={doc.id} href={path(`shared/${token}/reader/${doc.id}`)}>Read {doc.title}</Link>)}</div></> : <p role="status">Opening your reading…</p>}</section></main>;
}
