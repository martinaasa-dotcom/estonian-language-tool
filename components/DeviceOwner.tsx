"use client";

import { useEffect } from "react";
import { forgetIfOwnerChanged } from "@/lib/offline/forget";

/**
 * Notices when a different account is using this browser and clears what the
 * last one left behind. See `forgetIfOwnerChanged` in `lib/offline/forget.ts`
 * for the case it exists for. Renders nothing; the shell mounts it once.
 *
 * `owner` is a digest of the account id made on the server, never the id
 * itself, so what a shared machine holds afterwards is a code that says
 * "somebody" rather than "who".
 */
export function DeviceOwner({ owner }: { owner: string }) {
  useEffect(() => {
    void forgetIfOwnerChanged(owner);
  }, [owner]);
  return null;
}
