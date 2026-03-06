const getEnvRecord = () =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env ?? {};

export function getRequiredEnv(key: string): string {
  const value = getEnvRecord()[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function getOptionalEnv(key: string): string | undefined {
  return getEnvRecord()[key] || undefined;
}
