/** Bound the caller even when a transport ignores AbortSignal. The owner must
 * retain its in-flight operation until settlement to avoid starting new work. */
export async function withinProbeDeadline<T>(operation: Promise<T>, milliseconds = 3000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Probe deadline exceeded')), milliseconds); })]);
  }
  finally {
    if (timer)
      clearTimeout(timer);
  }
}
