// Serialize balance-changing workflows in this webview, including background sweeps.
let tail: Promise<unknown> = Promise.resolve();
export async function withSparkBalanceLock<T>(work: () => Promise<T>): Promise<T> {
  const previous = tail;
  let release!: () => void;
  tail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try { return await work(); } finally { release(); }
}
