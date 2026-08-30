import { NextRequest, NextResponse } from "next/server";

import { inspectBackup, restoreBackup } from "@/app/actions";
import { reportError } from "@/lib/observability/report";

/**
 * Restoring a backup, as a Route Handler rather than a Server Action.
 *
 * CLAUDE.md draws the line at "Server actions for mutations; Route Handlers
 * for streaming and third-party proxying", and a file upload sits on the
 * second side of it. This one earned its place by failing: a 990 KB export,
 * two months of one learner's history, was rejected twice over on the way
 * through the Server Action encoding. First by the 1 MB body limit, and then,
 * with that raised, by React's own guard on the decoded payload. Both are
 * properties of the transport, not of the data, and both scale the wrong way:
 * the person with the longest history is the first to lose the ability to
 * restore it.
 *
 * The body here is the backup file itself, sent as text, so nothing re-encodes
 * it on the way in. The mode rides in the query string. Everything that
 * matters, the session check, the schema check, the transaction and the rule
 * that a restore never deletes a review, stays in `restoreBackup`: this only
 * changes how the bytes arrive.
 */
export async function POST(request: NextRequest) {
  const asked = request.nextUrl.searchParams.get("mode");
  /*
    "inspect" reads the file and reports what is in it without writing
    anything, which is what the panel does the moment a file is chosen. It
    goes through the same route for the same reason: it was handed the same
    whole file, so it had the same ceiling one step earlier, and a learner who
    cannot even be told what their backup holds is no better off.
  */
  const mode = asked === "replace" ? "replace" : asked === "inspect" ? "inspect" : "merge";

  let json: string;
  try {
    json = await request.text();
  } catch (cause) {
    await reportError(cause, { at: "api/restore", extra: { stage: "read" } });
    return NextResponse.json(
      { ok: false, error: "The upload did not finish, and nothing was changed. Try again." },
      { status: 400 },
    );
  }

  if (!json.trim()) {
    return NextResponse.json({ ok: false, error: "That file was empty." }, { status: 400 });
  }

  /*
    A backup that arrived cut in half, told apart from a file that was never a
    backup.

    Both fail the schema check, and until this they failed it with the same
    sentence: "that doesn't look like a Kodukeel backup". For a truncated
    upload that is a wrong answer, and a discouraging one — the file is a
    perfectly good backup, it is the transport that gave up, and the learner
    has no way to tell from the message that trying a smaller export or
    raising a limit is what would help.

    A backup is one JSON object, so it ends in a closing brace. Anything that
    parses as JSON is left to the schema check as before; only a *whole* file
    that does not close is treated as truncated, which is a property of the
    bytes rather than a guess about their contents.
  */
  const closed = json.trimEnd().endsWith("}");
  if (!closed) {
    await reportError(new Error("restore upload truncated"), {
      at: "api/restore",
      extra: { stage: "read", bytes: json.length },
    });
    return NextResponse.json(
      {
        ok: false,
        error:
          `Only part of that file arrived: ${Math.round(json.length / 1_048_576)} MB of it, ` +
          "and it stops mid-way rather than at the end. Nothing was changed and your file is " +
          "untouched. This is a limit on the upload rather than anything wrong with the backup.",
      },
      { status: 413 },
    );
  }

  try {
    const result = mode === "inspect" ? await inspectBackup(json) : await restoreBackup(json, mode);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (cause) {
    // requireUserId throws for a signed-out caller; everything else is real.
    await reportError(cause, { at: "api/restore", extra: { stage: "restore", bytes: json.length } });
    return NextResponse.json(
      {
        ok: false,
        error:
          "The restore did not finish, and nothing was changed. Your backup file is untouched, so it is safe to try again.",
      },
      { status: 500 },
    );
  }
}
