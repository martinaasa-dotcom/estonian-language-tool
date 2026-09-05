"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { Check, Copy, LogOut, Plus, Printer } from "lucide-react";
import { archiveClassroom, assignHomework, assignUnit, createClassroom, joinClassroom, leaveClassroom } from "@/app/actions";
import { Button } from "@/components/Button";
import { ChoiceCard, ChoiceChip, ChoiceGroup } from "@/components/Choice";
import { CODE_LENGTH } from "@/lib/classroom/code";
import {
  COHORT_DETAIL, COHORT_KINDS, COHORT_LABEL, type CohortKind,
} from "@/lib/classroom/cohort";
import { EXAM_LEVELS } from "@/lib/exam/spec";

export function CreateClass() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CohortKind>("CLASS");
  const [level, setLevel] = useState<string>("B1");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const workplace = kind === "WORKPLACE";

  const create = () => {
    setError(null);
    start(async () => {
      const result = await createClassroom(name, kind, level);
      if (!result.ok) { setError(result.error); return; }
      router.push(`/class/${result.id}`);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <ChoiceGroup label="What is this?" select="one" className="grid gap-2">
        {COHORT_KINDS.map((option) => (
          <ChoiceCard
            key={option}
            selected={kind === option}
            onSelect={() => setKind(option)}
            title={COHORT_LABEL[option]}
            detail={COHORT_DETAIL[option]}
          />
        ))}
      </ChoiceGroup>

      <label htmlFor="class-name" className="label-xs" style={{ color: "var(--ink-3)" }}>
        {workplace ? "Group name" : "Class name"}
      </label>
      <input
        id="class-name"
        value={name}
        maxLength={60}
        onChange={(e) => setName(e.target.value)}
        placeholder={workplace ? "Estonian at work, autumn" : "Eesti keel A2, teisipäev"}
        className="field text-base"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
      />

      {/*
        Only a workplace group is asked. A band saying somebody is on track has
        to be on track *for* something, and the whole reason a workplace pays
        for this is a paper with a date on it. A teacher is working through a
        syllabus rather than aiming at one level, so asking them would be a
        question with no use for the answer.
      */}
      {workplace && (
        <ChoiceGroup label="Which paper are they working toward?" select="one">
          {EXAM_LEVELS.map((band) => (
            <ChoiceChip key={band} selected={level === band} onSelect={() => setLevel(band)} even>
              {band}
            </ChoiceChip>
          ))}
        </ChoiceGroup>
      )}

      {error && <p role="alert" className="text-xs" style={{ color: "var(--again-ink)" }}>{error}</p>}
      <Button variant="primary" onClick={create} disabled={pending || name.trim().length < 2}>
        <Plus size={15} aria-hidden />{" "}
        {pending ? "Creating…" : workplace ? "Create the group" : "Create the class"}
      </Button>
    </div>
  );
}

export function JoinClass({ suggestedName }: { suggestedName: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState(suggestedName);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const join = () => {
    setError(null);
    start(async () => {
      const result = await joinClassroom(code, name);
      if (!result.ok) { setError(result.error); return; }
      router.push(`/class/${result.id}`);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="join-code" className="label-xs" style={{ color: "var(--ink-3)" }}>
        Join code from your teacher
      </label>
      <input
        id="join-code"
        value={code}
        maxLength={CODE_LENGTH + 2}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="ABC234"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        className="field text-xl tracking-[0.3em]"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
      />
      <label htmlFor="join-name" className="label-xs" style={{ color: "var(--ink-3)" }}>
        The name your class will see
      </label>
      <input
        id="join-name"
        value={name}
        maxLength={32}
        onChange={(e) => setName(e.target.value)}
        placeholder="Kadri"
        className="field text-base"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
      />
      {error && <p role="alert" className="text-xs" style={{ color: "var(--again-ink)" }}>{error}</p>}
      <Button variant="primary" onClick={join} disabled={pending || code.trim().length < CODE_LENGTH}>
        {pending ? "Joining…" : "Join the class"}
      </Button>
      <p className="text-xs" style={{ color: "var(--ink-3)" }}>
        Joining shares your name, your streak, your XP for the week and how many words you know
        with your teacher and classmates. It shares one more thing with your teacher alone: which
        grammar case you personally get wrong most, as one percentage across your own reviews,
        never a specific answer. A workplace group shares less: your name, whether you have been
        practicing, and one of four bands for the paper the group works toward. Not your deck, not
        your searches, not your mistakes one by one. Leaving stops all of it right away.
      </p>
    </div>
  );
}

export function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(code).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        });
      }}
      className="press inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-ui hover:-translate-y-px"
      style={{ borderColor: "var(--rule)", background: "var(--surface)", color: copied ? "var(--good-ink)" : "var(--ink-2)" }}
    >
      {copied ? <><Check size={13} aria-hidden /> Copied</> : <><Copy size={13} aria-hidden /> Copy code</>}
    </button>
  );
}

export function LeaveClass({ classroomId }: { classroomId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => {
          const result = await leaveClassroom(classroomId);
          if (!result.ok) { setError(result.error); return; }
          router.push("/class");
          router.refresh();
        })}
        className="inline-flex items-center gap-1.5 text-xs"
        style={{ color: "var(--ink-3)" }}
      >
        <LogOut size={12} aria-hidden /> Leave this class
      </button>
      {error && <p role="alert" className="mt-1 text-xs" style={{ color: "var(--again-ink)" }}>{error}</p>}
    </>
  );
}

export function ArchiveClass({ classroomId }: { classroomId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs"
        style={{ color: "var(--ink-3)" }}
      >
        Archive this class
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-xs" style={{ color: "var(--ink-2)" }}>
      The join code stops working. Nobody loses any work.
      <Button variant="danger" disabled={pending} onClick={() => start(async () => {
        await archiveClassroom(classroomId);
        router.push("/class");
        router.refresh();
      })}>
        Archive
      </Button>
      <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
    </span>
  );
}

export function AssignUnit({ classroomId, units }: {
  classroomId: string;
  units: { id: string; title: string; subtitle: string }[];
}) {
  const router = useRouter();
  const [unitId, setUnitId] = useState(units[0]?.id ?? "");
  const [due, setDue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[210px] flex-1">
        <label htmlFor="assign-unit" className="label-xs mb-1 block" style={{ color: "var(--ink-3)" }}>
          Set a unit as homework
        </label>
        <select
          id="assign-unit"
          value={unitId}
          onChange={(e) => setUnitId(e.target.value)}
          className="w-full rounded-[var(--r)] border px-3 py-2 text-sm"
          style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
        >
          {units.map((u) => (
            <option key={u.id} value={u.id}>{u.title}, {u.subtitle}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="assign-due" className="label-xs mb-1 block" style={{ color: "var(--ink-3)" }}>
          Due (optional)
        </label>
        <input
          id="assign-due"
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="field text-sm"
          style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
        />
      </div>
      <Button
        variant="primary"
        disabled={pending || !unitId}
        onClick={() => start(async () => {
          const result = await assignUnit(classroomId, unitId, due || undefined);
          setMessage(result.ok ? `Sent to ${result.assigned} ${result.assigned === 1 ? "person" : "people"}.` : result.error);
          router.refresh();
        })}
      >
        {pending ? "Sending…" : "Assign"}
      </Button>
      {/* The same unit, on paper. A class that meets in a room wants both. */}
      <Link
        href={`/learn/${unitId}/worksheet`}
        className="press inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold transition-ui hover:-translate-y-px"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink-2)" }}
      >
        <Printer size={14} aria-hidden /> Worksheet
      </Link>
      {message && <p role="status" className="w-full text-xs" style={{ color: "var(--ink-3)" }}>{message}</p>}
    </div>
  );
}

/**
 * Anything else as homework: a page number, an exercise, a sentence to write.
 * Most of what a real class actually assigns is not one of the fixed units,
 * so `AssignUnit` alone left a teacher typing the real homework into a
 * WhatsApp group anyway, which is the exact gap the class feature exists to
 * close.
 */
export function AssignHomework({ classroomId }: { classroomId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [due, setDue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const send = () => {
    setMessage(null);
    start(async () => {
      const result = await assignHomework(classroomId, title, notes, due || undefined);
      if (!result.ok) { setMessage(result.error); return; }
      setMessage(`Sent to ${result.assigned} ${result.assigned === 1 ? "person" : "people"}.`);
      setTitle("");
      setNotes("");
      setDue("");
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="assign-title" className="label-xs" style={{ color: "var(--ink-3)" }}>
        Title
      </label>
      <input
        id="assign-title"
        value={title}
        maxLength={200}
        placeholder="Write 5 sentences using the partitive"
        onChange={(e) => setTitle(e.target.value)}
        className="field text-sm"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
      />
      <label htmlFor="assign-notes" className="label-xs" style={{ color: "var(--ink-3)" }}>
        Details (optional)
      </label>
      <textarea
        id="assign-notes"
        value={notes}
        maxLength={1900}
        rows={2}
        placeholder="Textbook page 34, exercise 3. Bring it printed on Thursday."
        onChange={(e) => setNotes(e.target.value)}
        className="field text-sm"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
      />
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="assign-hw-due" className="label-xs mb-1 block" style={{ color: "var(--ink-3)" }}>
            Due (optional)
          </label>
          <input
            id="assign-hw-due"
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="field text-sm"
            style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
          />
        </div>
        <Button variant="primary" disabled={pending || title.trim().length < 2} onClick={send}>
          {pending ? "Sending…" : "Set as homework"}
        </Button>
      </div>
      {message && <p role="status" className="text-xs" style={{ color: "var(--ink-3)" }}>{message}</p>}
    </div>
  );
}
