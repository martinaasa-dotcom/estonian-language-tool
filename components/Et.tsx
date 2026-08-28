import type { ReactNode } from "react";

/**
 * Estonian text.
 *
 * The `lang` attribute is not decoration: a screen reader on an English page
 * pronounces `tuba` and `õppima` with English phonics, which is useless to
 * someone learning the language. It also stops browser translation mangling the
 * very words being studied.
 */
export function Et({ children, className = "", serif = true }: {
  children: ReactNode;
  className?: string;
  serif?: boolean;
}) {
  return (
    <span lang="et" className={`${serif ? "est " : ""}${className}`.trim()}>
      {children}
    </span>
  );
}
