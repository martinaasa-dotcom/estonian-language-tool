import { ButtonLink } from "@/components/Button";

export const metadata = { title: "Not found · Kodukeel" };

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-5 py-20 text-center">
      <p lang="et" className="est text-[30px] font-bold" style={{ color: "var(--ink)" }}>
        Ei leidnud
      </p>
      <p className="mt-1 text-[14.5px]" style={{ color: "var(--ink-2)" }}>
        Not found — there is no page at that address.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/" variant="primary">Today</ButtonLink>
        <ButtonLink href="/dictionary">Dictionary</ButtonLink>
      </div>
    </div>
  );
}
