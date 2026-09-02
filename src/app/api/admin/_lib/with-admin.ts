import type { ZodType, z } from "zod";
import { ADMIN_ROLE, auth } from "@/lib/auth";
import { ApiError, jsonError } from "./errors";

/**
 * The admin behind the request. Only the fields a handler could reasonably
 * want; the session row itself is not passed on, because nothing needs it.
 */
export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role?: string | null;
}

export interface AdminContext<Body, Query> {
  request: Request;
  body: Body;
  query: Query;
  user: AdminUser;
}

type Parsed<S> = S extends ZodType ? z.output<S> : undefined;

/**
 * Resolve the session and insist it is Gabrielle's.
 *
 * The proxy checks this too. It is checked again here because the proxy is a
 * matcher — one edit to `config.matcher`, one route moved out from under
 * `/api/admin`, and every handler behind it is open. A handler that refuses on
 * its own does not depend on being routed through anything.
 *
 * No session, a forged or expired token, or a lookup that throws are all
 * "unauthenticated" (401); a real session on a user without the role is
 * "authenticated, but not allowed" (403).
 */
async function requireAdmin(request: Request): Promise<AdminUser> {
  let user: AdminUser | undefined;
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    user = session?.user as AdminUser | undefined;
  } catch {
    // Fail closed: an unreachable database is not an authorisation.
    throw new ApiError(401, "Unauthorized");
  }

  if (!user) throw new ApiError(401, "Unauthorized");
  if (user.role !== ADMIN_ROLE) throw new ApiError(403, "Forbidden");
  return user;
}

/**
 * A malformed body is a client mistake, not a server fault: `request.json()`
 * throwing used to escape the handler as an unhandled 500 with a stack.
 */
async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "Invalid JSON body");
  }
}

/**
 * Every message is written into the schemas, so the response says "Missing
 * scheduleId" rather than "Expected number, received undefined". Repeats are
 * dropped: three missing fields sharing one message read as one complaint.
 */
function parse<S extends ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const messages = [...new Set(result.error.issues.map((i) => i.message))];
  throw new ApiError(400, messages.join("; "));
}

function queryOf(request: Request) {
  return Object.fromEntries(new URL(request.url).searchParams);
}

/**
 * Everything every admin route has to do before it can do its own work:
 * establish who is asking, turn the request into the values the handler wants,
 * and give one shape to whatever goes wrong.
 *
 * A handler receives values, never a `Request` to pick apart, and reports a
 * refusal by throwing `ApiError` — so `withAdmin` owns the error shape and no
 * route re-types `{ error }`.
 */
export function withAdmin<
  BodySchema extends ZodType | undefined = undefined,
  QuerySchema extends ZodType | undefined = undefined,
>(
  schema: { body?: BodySchema; query?: QuerySchema },
  handler: (
    context: AdminContext<Parsed<BodySchema>, Parsed<QuerySchema>>,
  ) => Response | Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    try {
      const user = await requireAdmin(request);

      const query = (
        schema.query ? parse(schema.query, queryOf(request)) : undefined
      ) as Parsed<QuerySchema>;
      const body = (
        schema.body ? parse(schema.body, await readJson(request)) : undefined
      ) as Parsed<BodySchema>;

      return await handler({ request, body, query, user });
    } catch (error) {
      if (error instanceof ApiError) {
        return jsonError(error.message, error.status);
      }
      // Anything else is a fault, not a refusal: it is ours to see in the logs
      // and not the caller's to read a stack trace of.
      console.error(
        `Admin route failed: ${request.method} ${request.url}`,
        error,
      );
      return jsonError("Something went wrong", 500);
    }
  };
}
