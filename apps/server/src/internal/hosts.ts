import { getHost } from "@bb/db";
import { isLoopbackAddress } from "@bb/config/loopback";
import {
  hostDaemonEnrollKeyRequestSchema,
  hostDaemonEnrollRequestSchema,
  typedRoutes,
  type HostDaemonInternalSchema,
} from "@bb/host-daemon-contract";
import type { Hono } from "hono";
import type { AppDeps } from "../types.js";
import { ApiError } from "../errors.js";
import {
  getGateAuthKind,
  getGateMachineId,
  getTrustedRemoteAddress,
  type GateAuthHeaderReader,
} from "../request-context.js";
import { assertMatchingExistingHostType } from "../services/hosts/host-type-guard.js";
import { issuePersistentHostEnrollKey } from "../services/hosts/host-enrollment.js";
import { requireBearerToken } from "./auth.js";

function assertLoopbackRequest(remoteAddress: string | undefined): void {
  if (remoteAddress && isLoopbackAddress(remoteAddress)) {
    return;
  }
  throw new ApiError(
    400,
    "unsupported_host",
    "This enrollment route is available only from the server machine",
  );
}

export function resolveReportedConnectMachineId(
  context: GateAuthHeaderReader,
  reportedMachineId: string | undefined,
): string | undefined {
  if (getGateAuthKind(context) !== "machine") return reportedMachineId;
  const gateMachineId = getGateMachineId(context);
  if (gateMachineId === null || reportedMachineId !== gateMachineId) {
    throw new ApiError(
      403,
      "connect_machine_id_mismatch",
      "Connect machine identity does not match the authenticated credential",
    );
  }
  return gateMachineId;
}

export function registerInternalHostRoutes(app: Hono, deps: AppDeps): void {
  const { post } = typedRoutes<HostDaemonInternalSchema>(app, {
    onValidationError: (message) =>
      new ApiError(400, "invalid_request", message),
  });

  post(
    "/hosts/enroll-key",
    hostDaemonEnrollKeyRequestSchema,
    async (context, payload) => {
      if (getGateAuthKind(context) === "machine") {
        throw new ApiError(
          403,
          "machine_host_management_forbidden",
          "Machine credentials cannot mint host enrollment keys",
        );
      }
      assertLoopbackRequest(getTrustedRemoteAddress(context));
      const issued = await issuePersistentHostEnrollKey(deps, {
        enrollSource: "loopback",
        ...(payload.hostId ? { hostId: payload.hostId } : {}),
      });

      return context.json(
        {
          enrollKey: issued.enrollKey.key,
          expiresAt: issued.enrollKey.expiresAt,
          hostId: issued.hostId,
        },
        201,
      );
    },
  );

  /**
   * Exchange enrollment material for a host key. Deliberately creates no host
   * row: the row is created when the daemon opens its first session
   * (`/internal/session/open`), with the same daemon-reported name.
   *
   * Enrolling proves the key is valid, not that the daemon can reach this
   * server. A daemon that enrolls over one path (the connect gate, or a
   * network the machine has since left) and then cannot open its session used
   * to leave a machine listed as "Offline, last seen never" forever —
   * indistinguishable from a machine that once worked and is currently off.
   * Only a completed handshake means "this machine is paired with this
   * server", so only a completed handshake puts it in the list.
   *
   * `payload.hostName` is therefore unread here; see the note on it in
   * `hostDaemonEnrollRequestSchema` for why it stays on the wire.
   */
  post(
    "/hosts/enroll",
    hostDaemonEnrollRequestSchema,
    async (context, payload) => {
      // Validated here even though it is persisted at session open: a forged
      // id must be refused before any key is handed out.
      resolveReportedConnectMachineId(context, payload.connectMachineId);
      const token = requireBearerToken(context.req.header("authorization"));
      const enrollment = await deps.machineAuth.enrollHost({
        allowPublicEnrollment: true,
        hostId: payload.hostId,
        hostType: payload.hostType,
        token,
      });

      if (!enrollment) {
        throw new ApiError(401, "unauthorized", "Unauthorized");
      }
      assertMatchingExistingHostType({
        existingHost: getHost(deps.db, enrollment.metadata.hostId),
        requestedHostType: enrollment.metadata.hostType,
      });

      return context.json(
        {
          hostId: enrollment.metadata.hostId,
          hostKey: enrollment.hostKey,
        },
        201,
      );
    },
  );
}
