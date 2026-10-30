export async function edgeErrorMessage(error: unknown, data?: { error?: unknown } | null): Promise<string> {
  if (typeof data?.error === 'string') return data.error;
  // FunctionsHttpError.message is generic; the useful server response lives in context.
  if (error && typeof error === 'object' && 'context' in error) {
    const context = error.context as { clone?: () => { json: () => Promise<{ error?: unknown }> } };
    try {
      const body = await context?.clone?.().json();
      if (typeof body?.error === 'string') return body.error;
    } catch { /* A gateway or network failure may not have a JSON response. */ }
  }
  return error && typeof error === 'object' && 'message' in error
    ? String(error.message) : 'לא ניתן להשלים את הפעולה. נסו שוב.';
}
