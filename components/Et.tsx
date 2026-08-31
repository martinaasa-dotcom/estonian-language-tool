import type { ReactNode } from "react";

/**
 * Estonian text.
 *
 * The `lang` attribute is not decoration: a screen reader on an English page
 * pronounces `tuba` and `õppima` with English phonics, which is useless to
 * someone learning the language. It also stops browser translation mangling the
 * very words being studied.
 *
 * It is the whole of what this marks. Estonian used to be set in a second face,
 * which put two typefaces inside one card wherever a prompt and its answers are
 * in different languages, and that is most of the app.
 */
export function Et({ children, className = "" }: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span lang="et" className={className}>
      {children}
    </span>
  );
}
