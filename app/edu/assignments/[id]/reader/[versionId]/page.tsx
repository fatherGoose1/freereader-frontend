"use client";
import { use, useEffect, useState } from "react";
import { useEdu } from "../../../../EduProvider";
import { eduFetch } from "../../../../client";
import AssignmentReader from "../../../../AssignmentReader";
import type { Assignment, DocumentVersion } from "../../../../model";
import styles from "../../../../edu.module.css";

export default function ReaderPage({ params }: { params: Promise<{ id: string; versionId: string }> }) {
  const { id, versionId } = use(params);
  const { userId } = useEdu();
  const [data, setData] = useState<{ assignment: Assignment; documents: DocumentVersion[] } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void eduFetch<{ assignment: Assignment; documents: DocumentVersion[] }>(`assignments/${id}`, userId, { signal: controller.signal }).then((data) => { if (!controller.signal.aborted) setData(data); }).catch((error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [id, userId]);
  const version = data?.documents.find((doc) => doc.id === versionId);
  if (data && !version) return <main className={styles.main}><p role="alert">This document is not part of the assignment.</p></main>;
  return data && version ? <AssignmentReader assignment={data.assignment} version={version} documents={data.documents} /> : <main className={styles.main}><p role={error ? "alert" : "status"}>{error || "Opening assignment…"}</p></main>;
}
