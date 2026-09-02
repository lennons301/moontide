import { vi } from "vitest";

/**
 * A stubbed `fetch` for the admin pages, which each load two or three
 * resources before they render a row.
 *
 * Routes are keyed `"<METHOD> <path prefix>"`, so a GET and a PUT on the same
 * path are different answers.
 */
export interface StubResponse {
  status?: number;
  /** The JSON body. */
  json?: unknown;
  /** A body that is not JSON at all — an HTML 502 from in front of the app. */
  html?: string;
  /** The request never reached a server. */
  networkError?: boolean;
}

export type StubRoute = StubResponse | (() => StubResponse);

function toResponse(stub: StubResponse): Response {
  const status = stub.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (stub.html !== undefined) {
        throw new SyntaxError("Unexpected token '<', \"<html>\" is not JSON");
      }
      return stub.json;
    },
    text: async () => stub.html ?? JSON.stringify(stub.json),
  } as Response;
}

export function stubFetch(routes: Record<string, StubRoute>) {
  const keys = Object.keys(routes);
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const key = keys.find(
      (k) =>
        k.startsWith(`${method} `) &&
        String(input).startsWith(k.slice(method.length + 1)),
    );
    if (!key) throw new Error(`No stub for ${method} ${input}`);
    const route = routes[key];
    const stub = typeof route === "function" ? route() : route;
    if (stub.networkError) throw new TypeError("Failed to fetch");
    return toResponse(stub);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
