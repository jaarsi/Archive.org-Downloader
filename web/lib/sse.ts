export function createLineBuffer() {
  let buf = "";
  return {
    push(chunk: string): string[] {
      buf += chunk;
      const parts = buf.split("\n");
      buf = parts.pop() ?? "";
      return parts.filter((l) => l.trim() !== "");
    },
    flush(): string[] {
      const rest = buf.trim();
      buf = "";
      return rest ? [rest] : [];
    },
  };
}
