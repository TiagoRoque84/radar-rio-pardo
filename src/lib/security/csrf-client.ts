export function readCsrfCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("radar_rp_csrf="));
  return match ? decodeURIComponent(match.slice("radar_rp_csrf=".length)) : null;
}

export function csrfJsonHeaders(): Record<string, string> {
  const token = readCsrfCookie();
  return token
    ? { "Content-Type": "application/json", "x-csrf-token": token }
    : { "Content-Type": "application/json" };
}
