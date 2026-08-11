const MAX_TIMER_DELAY_MS = 2_147_483_647;

export function scheduleDeadline(deadline: number, onDeadline: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const arm = (): void => {
    if (disposed) return;
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      onDeadline();
      return;
    }
    timer = setTimeout(() => {
      timer = undefined;
      arm();
    }, Math.min(remaining, MAX_TIMER_DELAY_MS));
  };

  arm();
  return () => {
    disposed = true;
    if (timer !== undefined) clearTimeout(timer);
  };
}
