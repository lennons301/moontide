import { NextResponse } from "next/server";

/**
 * The one shape every /api/admin/* failure takes. It was a convention held up
 * by twenty-four hand-written literals; it is a type and one constructor now,
 * so a route cannot quietly answer in a different shape.
 */
export interface ApiErrorBody {
  error: string;
}

export function jsonError(message: string, status: number) {
  return NextResponse.json<ApiErrorBody>({ error: message }, { status });
}

/**
 * A refusal a handler raises rather than returns.
 *
 * Thrown because a refusal is often decided somewhere a response cannot be
 * returned from — inside `db.transaction`, where the throw is also what rolls
 * the work back. `withAdmin` catches it and renders it through `jsonError`, so
 * "the seat went while we were claiming it" is one line at the point it is
 * discovered rather than a sentinel class and a catch block per route.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * The pure decision functions (`decideCancel`, `decideMakeOffer`, …) report a
 * refusal as `{ ok: false, error, httpStatus }`. This is that shape becoming
 * the thrown one.
 */
export function refuse(decision: { error: string; httpStatus: number }): never {
  throw new ApiError(decision.httpStatus, decision.error);
}
