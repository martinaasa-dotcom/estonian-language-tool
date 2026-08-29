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
