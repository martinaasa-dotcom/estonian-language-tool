/**
 * Class join codes.
 *
 * A code is written on a board, read out loud, and typed by thirty people on
 * their phones, so the alphabet leaves out every character that gets misread:
 * no O/0, no I/1/L, no U/V. What is left is 29 symbols, and six of them give
 * around 600 million codes — collisions are a non-issue at any plausible scale,
 * and the generator checks the database anyway.
 *
 * Note what normalisation deliberately does *not* do: guess. It uppercases and
 * drops the spaces and dashes people add themselves, and stops there. Mapping a
 * mistyped `0` onto `Q` would risk quietly putting a student in the wrong
 * class, which is far worse than telling them the code was not found.
 *
 * Pure, so the rules are testable without a database.
 */

const ALPHABET = "ABCDEFGHJKMNPQRSTWXYZ23456789";
export const CODE_LENGTH = 6;

/** A new random code. Uniqueness is the caller's job — it owns the database. */
export function generateCode(random: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[Math.floor(random() * ALPHABET.length)] ?? "A";
  }
  return out;
}

/**
 * What someone typed, turned into what to look up.
 *
 * Takes anything, because the caller is a Server Action argument and those
 * are JSON off the wire whatever the type says: `joinClassroom(42)` reached
 * `.trim()` here and threw, which the framework answers with a 500 where a
 * refusal is the honest reply. A non-string is not a code.
 */
export function normaliseCode(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.trim().toUpperCase().replace(/[\s-]/g, "").slice(0, CODE_LENGTH);
}

export function isValidCode(input: unknown): boolean {
  const code = normaliseCode(input);
  return code.length === CODE_LENGTH && [...code].every((ch) => ALPHABET.includes(ch));
}

/** The characters a code can contain, for the input's own guidance text. */
export const CODE_ALPHABET = ALPHABET;
