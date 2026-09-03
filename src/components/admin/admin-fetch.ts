import { useCallback, useEffect, useRef, useState } from "react";
import { goToLogin } from "@/lib/admin/navigate";

/**
 * Every admin page talks to `/api/admin/*` through this module, and nowhere
 * else calls `fetch` for one.
 *
 * The pages used to each re-invent load, error and refetch, and disagreed:
 * seven loaders read `res.json()` without ever asking whether the response was
 * one — so the proxy's `{"error":"Unauthorized"}` landed in a list and the next
 * `.map` threw — and four mutations discarded the result entirely, so a refusal
 * the API had phrased carefully produced no change on screen at all.
 *
 * So: a request answers with a result, never a thrown response and never an
 * unchecked body. `ok: false` always carries a sentence fit to show someone —
 * the server's own wording when there is one. A 401 is handled here, once: the
 * session has gone, and the only useful answer is the login page.
 */
export type AdminResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

/** `status: 0` — the request never reached a server to be answered by one. */
const NO_RESPONSE_STATUS = 0;

const UNREACHABLE =
  "Could not reach the server. Check your connection and try again.";
const UNREADABLE = "The server sent a response we could not read.";
const SESSION_EXPIRED = "Your session has expired. Taking you to sign in...";

/**
 * The server's phrasing if it sent one — `{ error }` is the single shape every
 * admin handler renders a refusal in — and the status if it did not. A failing
 * response is not necessarily JSON: a 502 from in front of the app is HTML, and
 * reading it as JSON is what left the pricing page's Save button stuck.
 */
async function refusalMessage(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  if (body && typeof body.error === "string" && body.error.trim()) {
    return body.error;
  }
  return `Something went wrong (${res.status}).`;
}

export async function requestAdmin<T>(
  path: string,
  init?: RequestInit,
): Promise<AdminResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    return { ok: false, error: UNREACHABLE, status: NO_RESPONSE_STATUS };
  }

  if (res.status === 401) {
    goToLogin();
    return { ok: false, error: SESSION_EXPIRED, status: 401 };
  }

  if (!res.ok) {
    return { ok: false, error: await refusalMessage(res), status: res.status };
  }

  try {
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, error: UNREADABLE, status: res.status };
  }
}

export interface AdminMutation {
  method: "POST" | "PUT" | "DELETE";
  /** JSON body. Omit it for the routes that carry everything in the query. */
  body?: unknown;
}

/**
 * A write. The result has to be read to learn anything, so a call site cannot
 * quietly drop the refusal the way `if (res.ok)` with no `else` did.
 */
export function mutateAdmin<T = unknown>(
  path: string,
  mutation: AdminMutation,
): Promise<AdminResult<T>> {
  const { method, body } = mutation;
  return requestAdmin<T>(path, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
}

export interface AdminResource<T> {
  /** The last successful body, or the fallback — never a parsed error object. */
  data: T;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export interface AdminResourceOptions {
  /** False holds the fetch back — a panel that only loads when it is opened. */
  enabled?: boolean;
}

/**
 * One admin resource: its data, whether it is loading, why it is not, and how
 * to ask again. `loading` and `error` are properties of the resource rather
 * than something each page decides to keep.
 */
export function useAdminResource<T>(
  path: string,
  fallback: T,
  options: AdminResourceOptions = {},
): AdminResource<T> {
  const { enabled = true } = options;
  // The fallback is written as a literal at the call site, so a new value every
  // render; only the first is ever needed, and it is what a failure resets to.
  const fallbackRef = useRef(fallback);
  const [data, setData] = useState<T>(fallbackRef.current);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    const result = await requestAdmin<T>(path);
    if (result.ok) {
      setData(result.data);
      setError(null);
    } else {
      setData(fallbackRef.current);
      setError(result.error);
    }
    setLoading(false);
  }, [path]);

  // `enabled` is a dependency, not just a guard: a panel closed and reopened on
  // the same resource has to load again.
  useEffect(() => {
    if (enabled) refetch();
  }, [enabled, refetch]);

  return { data, loading, error, refetch };
}
