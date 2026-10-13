"use client";

import { useState, type FormEvent } from "react";
import styles from "./school.module.css";

export default function SchoolContactForm() {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    if (fields.get("website")) { setSubmitted(true); return; }
    const name = String(fields.get("name") ?? "").trim();
    const school = String(fields.get("school") ?? "").trim();
    const jobTitle = String(fields.get("jobTitle") ?? "").trim();
    const email = String(fields.get("email") ?? "").trim();
    const students = String(fields.get("students") ?? "").trim();
    if (!name || !school || !email || !/^[0-9]+$/.test(students)) {
      setError("Check the form details and try again.");
      return;
    }

    setSubmitting(true);
    setSubmitted(false);
    setError("");
    try {
      const response = await fetch("/api/support-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          message: [
            "FreeReader for Schools inquiry",
            `Name: ${name}`,
            `School or district: ${school}`,
            ...(jobTitle ? [`Job title: ${jobTitle}`] : []),
            `Approximate number of students: ${students}`,
          ].join("\n"),
          source_path: "/school",
        }),
      });
      if (!response.ok) throw new Error(response.status === 400 ? "Check the form details and try again." : "Could not send your request. Please try again.");
      form.reset();
      setSubmitted(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={(event) => void send(event)}>
      <div className={styles.trap} aria-hidden="true">
        <label htmlFor="school-website">Website</label>
        <input id="school-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <label className={styles.field} htmlFor="school-name">Name
        <input id="school-name" name="name" type="text" autoComplete="name" maxLength={120} required />
      </label>
      <label className={styles.field} htmlFor="school-organization">School or district name
        <input id="school-organization" name="school" type="text" autoComplete="organization" maxLength={160} required />
      </label>
      <label className={styles.field} htmlFor="school-role"><span className={styles.fieldLabel}>Job title <small>(optional)</small></span>
        <input id="school-role" name="jobTitle" type="text" autoComplete="organization-title" maxLength={120} />
      </label>
      <label className={styles.field} htmlFor="school-email">Work email
        <input id="school-email" name="email" type="email" autoComplete="email" maxLength={254} required />
      </label>
      <label className={styles.field} htmlFor="school-students">Approximate number of students
        <input id="school-students" name="students" type="text" inputMode="numeric" pattern="[0-9]+" maxLength={10} required />
      </label>
      {error && <p className={`${styles.status} ${styles.error}`} role="alert">{error}</p>}
      {submitted && <p className={`${styles.status} ${styles.success}`} role="status">Thanks! We&apos;ll be in touch soon.</p>}
      <button type="submit" disabled={submitting}>{submitting ? "Sending…" : "Contact our schools team"}</button>
    </form>
  );
}
