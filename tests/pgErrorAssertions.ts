/**
 * Drizzle ORM 0.45+ wraps PostgreSQL errors as DrizzleQueryError and retains
 * the original driver error in `cause`. PostgreSQL integration tests must
 * assert the trigger's original message, not the ORM wrapper's SQL text.
 * Rollback/immutability assertions stay in each individual test.
 */
export async function expectOriginalDatabaseError(
  operation: Promise<unknown>,
  expected: RegExp,
): Promise<void> {
  let failure: unknown;
  try {
    await operation;
  } catch (error) {
    failure = error;
  }

  if (!(failure instanceof Error)) {
    throw new Error("Expected an Error from the rejected PostgreSQL transaction");
  }
  const messages: string[] = [];
  let current: unknown = failure;
  for (let depth = 0; current instanceof Error && depth < 8; depth++) {
    messages.push(current.message);
    current = (current as Error & { cause?: unknown }).cause;
  }
  const chain = messages.join(" | caused by: ");
  if (!expected.test(chain)) {
    throw new Error(`Unexpected PostgreSQL error; expected ${expected}, received: ${chain}`);
  }
}
