import { Compass } from "lucide-react";
import { ButtonLink } from "@/components/Button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <Compass size={28} aria-hidden style={{ color: "var(--ink-3)" }} />
      <h1 className="est text-[26px] font-bold" style={{ color: "var(--ink)" }}>
        Seda lehte pole
      </h1>
      <p className="text-[14.5px]" style={{ color: "var(--ink-2)" }}>
        There&rsquo;s no page here. If you were after a word, the dictionary takes Estonian or
        English — and inflected forms, which is usually what you actually have in front of you.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/dictionary" variant="primary">Open the dictionary</ButtonLink>
        <ButtonLink href="/">Back to Today</ButtonLink>
      </div>
    </main>
  );
}
