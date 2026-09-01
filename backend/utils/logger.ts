const timestamp = () => new Date().toISOString();

export const logError = (context: string, error: unknown) => {
  console.error(`[${timestamp()}] [ERROR] ${context}`, error);
};
