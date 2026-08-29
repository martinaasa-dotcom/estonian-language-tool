"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/Button";

/**
 * Print this page.
 *
 * A separate component only because `window.print()` needs a client, and the
 * worksheet it sits on is otherwise a Server Component that touches the
 * database. Marked `no-print` so the button never appears on the paper.
 */
export function PrintButton({ label = "Print this worksheet" }: { label?: string }) {
  return (
    <Button variant="primary" className="no-print" onClick={() => window.print()}>
      <Printer size={15} aria-hidden /> {label}
    </Button>
  );
}
