"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useEdu } from "../EduProvider";
import { useDashboard } from "../useDashboard";
import { schoolDate } from "../model";
import styles from "../edu.module.css";
import UiIcon from "../UiIcon";

export default function Calendar() {
  const { path } = useEdu();
  const { school, data, error } = useDashboard();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [classId, setClassId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  useEffect(() => { setClassId(""); setTeacherId(""); if (school) setMonth(schoolDate(new Date().toISOString(), school.timezone).slice(0, 7)); }, [school?.id]);
  if (!school) return <main className={styles.main}><p>Join a school to see its calendar.</p></main>;
  const [year, number] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, number - 1, 1));
  const start = new Date(first.getTime() - first.getUTCDay() * 86400_000);
  const days = Math.ceil((first.getUTCDay() + new Date(Date.UTC(year, number, 0)).getUTCDate()) / 7) * 7;
  const changeMonth = (offset: number) => setMonth(new Date(Date.UTC(year, number - 1 + offset, 1)).toISOString().slice(0, 7));
  const assignments = (data?.assignments ?? []).filter((item) => (!classId || item.classIds.includes(classId)) && (!teacherId || item.createdBy === teacherId));
  return <main className={styles.main}><div className={styles.pageHeading}><div><span className={styles.eyebrow}>{school.name}</span><h1>Reading calendar</h1><p className={styles.muted}>Schedule and due dates · {school.timezone}</p></div></div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.calendarToolbar}><div className={styles.monthSwitch}><button aria-label="Previous month" onClick={() => changeMonth(-1)}><UiIcon name="back" /></button><label>Month <input type="month" required value={month} onChange={(event) => { if (event.target.value) setMonth(event.target.value); }} /></label><button aria-label="Next month" onClick={() => changeMonth(1)}><UiIcon name="arrow" /></button></div><div className={styles.calendarFilters}>
      <select aria-label="Filter by class" value={classId} onChange={(event) => setClassId(event.target.value)}><option value="">All classes</option>{data?.classes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
      {school.role === "admin" && <select aria-label="Filter by teacher" value={teacherId} onChange={(event) => setTeacherId(event.target.value)}><option value="">All assignment creators</option>{[...new Set(data?.assignments.map((item) => item.createdBy))].map((id) => <option key={id} value={id}>{data?.assignments.find((item) => item.createdBy === id)?.creatorEmail ?? id.slice(0, 8)}</option>)}</select>}
    </div></div>
    <div className={styles.calendar}>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div className={styles.weekDay} key={day}>{day}</div>)}
      {Array.from({ length: days }, (_, index) => {
        const day = new Date(start.getTime() + index * 86400_000).toISOString().slice(0, 10);
        return <div className={`${styles.day} ${day.startsWith(month) ? "" : styles.otherMonth}`} key={day}><time dateTime={day} className={styles.dayNumber}>{Number(day.slice(-2))}</time>
          {assignments.filter((item) => schoolDate(item.availableAt, school.timezone) <= day && schoolDate(item.dueAt, school.timezone) >= day).map((item) => <Link key={item.id} href={path(`assignments/${item.id}`)}>{item.title}{schoolDate(item.dueAt, school.timezone) === day ? " · Due" : ""}{item.status === "draft" ? " · Draft" : ""}</Link>)}
        </div>;
      })}
    </div>
  </main>;
}
