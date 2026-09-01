export const computeDuration = (startedAt: string, endedAt?: string) => {
  if (!endedAt) {
    return undefined;
  }
  const seconds = Math.round(
    (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000,
  );
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
};
