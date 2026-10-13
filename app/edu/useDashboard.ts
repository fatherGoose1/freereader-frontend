"use client";
import { useEffect, useState } from "react";
import { useEdu } from "./EduProvider";
import { eduFetch } from "./client";
import type { Assignment, Classroom } from "./model";

export function useDashboard() {
  const { school, userId } = useEdu();
  const [data, setData] = useState<{ classes: Classroom[]; assignments: Assignment[] } | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    setData(null); setError("");
    if (!school) return;
    const controller = new AbortController();
    void eduFetch<{ classes: Classroom[]; assignments: Assignment[] }>(`schools/${school.id}/dashboard`, userId, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setData(data); })
      .catch((error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [school?.id, revision]);
  return { school, data, error, reload: () => setRevision((value) => value + 1) };
}
