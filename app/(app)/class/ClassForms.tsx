"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, LogOut, Plus } from "lucide-react";
import { archiveClassroom, assignUnit, createClassroom, joinClassroom, leaveClassroom } from "@/app/actions";
import { Button } from "@/components/Button";
import { CODE_LENGTH } from "@/lib/classroom/code";

export function CreateClass() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const create = () => {
    setError(null);
    start(async () => {
      const result = await createClassroom(name);
      if (!result.ok) { setError(result.error); return; }
      router.push(`/class/${result.id}`);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="class-name" className="label-xs" style={{ color: "var(--ink-3)" }}>
        Class name
      </label>
      <input
        id="class-name"
        value={name}
        maxLength={60}
        onChange={(e) => setName(e.target.value)}
        placeholder="Eesti keel A2 — teisipäev"
        className="rounded-[var(--r)] border px-3.5 py-2.5 text-[15px] outline-none transition-shadow focus:shadow-[var(--shadow)]"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
      />
      {error && <p role="alert" className="text-[13px]" style={{ color: "var(--again)" }}>{error}</p>}
      <Button variant="primary" onClick={create} disabled={pending || name.trim().length < 2}>
        <Plus size={15} aria-hidden /> {pending ? "Creating…" : "Create the class"}
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
        className="est rounded-[var(--r)] border px-3.5 py-2.5 text-[22px] tracking-[0.3em] outline-none transition-shadow focus:shadow-[var(--shadow)]"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
      />
      <label htmlFor="join-name" className="label-xs" style={{ color: "var(--ink-3)" }}>
        Name your class will recognise
      </label>
      <input
        id="join-name"
        value={name}
        maxLength={32}
        onChange={(e) => setName(e.target.value)}
        placeholder="Kadri"
        className="rounded-[var(--r)] border px-3.5 py-2.5 text-[15px] outline-none transition-shadow focus:shadow-[var(--shadow)]"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
      />
      {error && <p role="alert" className="text-[13px]" style={{ color: "var(--again)" }}>{error}</p>}
      <Button variant="primary" onClick={join} disabled={pending || code.trim().length < CODE_LENGTH}>
        {pending ? "Joining…" : "Join the class"}
      </Button>
      <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>
        Joining shares your name, your streak, your XP for the week and how many words you know with
        your teacher and classmates. Not your deck, not your searches, not your mistakes one by one.
        Leaving stops it immediately.
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
      className="press inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-all hover:-translate-y-px"
      style={{ borderColor: "var(--rule)", background: "var(--surface)", color: copied ? "var(--good)" : "var(--ink-2)" }}
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
        className="inline-flex items-center gap-1.5 text-[12.5px]"
        style={{ color: "var(--ink-3)" }}
      >
        <LogOut size={12} aria-hidden /> Leave this class
      </button>
      {error && <p role="alert" className="mt-1 text-[12px]" style={{ color: "var(--again)" }}>{error}</p>}
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
        className="text-[12.5px]"
        style={{ color: "var(--ink-3)" }}
      >
        Archive this class
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--ink-2)" }}>
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
          className="w-full rounded-[var(--r)] border px-3 py-2 text-[14px]"
          style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
        >
          {units.map((u) => (
            <option key={u.id} value={u.id}>{u.title} — {u.subtitle}</option>
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
          className="rounded-[var(--r)] border px-3 py-2 text-[14px]"
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
      {message && <p role="status" className="w-full text-[12.5px]" style={{ color: "var(--ink-3)" }}>{message}</p>}
    </div>
  );
}
