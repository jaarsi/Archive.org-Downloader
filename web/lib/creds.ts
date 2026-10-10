// Resolve archive.org credentials: per-request form input wins, otherwise the
// server's default account (env). Password is never trimmed; email is.
export function resolveCreds(
  body: { email?: unknown; password?: unknown },
  env: Record<string, string | undefined>,
): { email: string; password: string } {
  const formEmail = typeof body.email === "string" ? body.email.trim() : "";
  const formPassword = typeof body.password === "string" ? body.password : "";
  return {
    email: formEmail || env.ARCHIVE_EMAIL || "",
    password: formPassword || env.ARCHIVE_PASSWORD || "",
  };
}
