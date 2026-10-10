// In-process concurrency limiter. One per server process (public endpoint
// guard so N anonymous requests can't spawn N heavy Python workers at once).
export function createGate(max: number) {
  let active = 0;
  return {
    tryAcquire(): boolean {
      if (active >= max) return false;
      active++;
      return true;
    },
    release(): void {
      if (active > 0) active--;
    },
  };
}
