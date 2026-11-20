export interface SparkConversionMinimum {
  attempted: bigint;
  minimum: bigint;
}

/**
 * Adapts the recognized Spark quote diagnostic into source-currency base units.
 * Provider prose is not a stable contract: unknown wording returns null so the
 * caller can propagate the original error rather than guess a minimum.
 */
export function parseSparkConversionMinimum(error: unknown): SparkConversionMinimum | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = /Amount in (\d+) is less than minimum required (\d+)\b/i.exec(message);
  if (!match) return null;

  const attempted = BigInt(match[1]);
  const minimum = BigInt(match[2]);
  if (attempted <= 0n || minimum <= attempted || minimum > BigInt(Number.MAX_SAFE_INTEGER)) {
    return null;
  }

  return { attempted, minimum };
}
