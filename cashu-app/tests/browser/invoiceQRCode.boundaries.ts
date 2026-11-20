// No native clipboard, toast UI, wallet or payment service is used by this fixture.
export const invoiceFixture = {
  writes: [] as string[],
  successes: [] as string[],
  errors: [] as string[],
  checks: 0,
  cancels: 0,
};

export const writeClipboardText = async (value: string) => {
  invoiceFixture.writes.push(value);
  const query = new URLSearchParams(location.search);
  if (query.has('copy-error')) throw new Error('Synthetic clipboard failure');
  return !query.has('copy-false');
};

export const toast = {
  success: (message: string) => invoiceFixture.successes.push(message),
  error: (message: string) => invoiceFixture.errors.push(message),
};
