import { createHostId, getHost } from "@bb/db";
import type { AppDeps } from "../../types.js";
import { assertMatchingExistingHostType } from "./host-type-guard.js";

type HostEnrollmentDeps = Pick<AppDeps, "db" | "machineAuth">;

export interface IssuePersistentHostEnrollKeyArgs {
  enrollSource: "loopback" | "public-multi-machine";
  hostId?: string;
}

/**
 * Mints an enroll key without creating a host row: the row is created when the
 * daemon opens its first session (`/internal/session/open` upserts it with the
 * daemon-reported name). Neither minting a key nor redeeming it proves a
 * machine can reach this server, so neither one may leave a phantom "pending"
 * machine behind.
 */
export async function issuePersistentHostEnrollKey(
  deps: HostEnrollmentDeps,
  args: IssuePersistentHostEnrollKeyArgs,
) {
  const hostId = args.hostId ?? createHostId();
  assertMatchingExistingHostType({
    existingHost: getHost(deps.db, hostId),
    requestedHostType: "persistent",
  });

  const enrollKey = await deps.machineAuth.issueHostEnrollKey({
    enrollSource: args.enrollSource,
    hostId,
    hostType: "persistent",
  });

  return { enrollKey, hostId };
}
