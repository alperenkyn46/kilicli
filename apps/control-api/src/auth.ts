import { createHash, timingSafeEqual } from "node:crypto";
import type { Principal, UserId } from "@kilic/domain";

export type PrincipalResolver = (request: Request) => Promise<Principal | null>;

function matches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function createLocalPrincipalResolver(input: {
  userId: UserId;
  userToken: string;
  serviceToken: string;
}): PrincipalResolver {
  if (!input.userToken || !input.serviceToken || input.userToken === input.serviceToken) throw new Error("Distinct local user and service tokens are required");
  return async (request) => {
    const header = request.headers.get("authorization") ?? "";
    if (!header.startsWith("Bearer ")) return null;
    const token = header.slice(7);
    if (matches(token, input.serviceToken)) return { kind: "service", serviceKey: "local-control" };
    if (matches(token, input.userToken)) return { kind: "user", userId: input.userId };
    return null;
  };
}
