/**
 * The constraint Postgres refused a write on. Drizzle wraps the driver error in
 * one of its own, so the name is on the cause rather than the message —
 * asserting on the name keeps a test about a specific index or check rather
 * than about the shape of an error string.
 */
export async function violatedConstraint(
  work: Promise<unknown>,
): Promise<string> {
  try {
    await work;
  } catch (error) {
    const cause = (error as { cause?: { constraint_name?: string } }).cause;
    return cause?.constraint_name ?? String(error);
  }
  throw new Error("Expected the write to be refused, but it succeeded");
}
