export async function pingBackend(message: string): Promise<{ ok: boolean; echo: string; serverTime: string }> {
  const res = await fetch("/api/ping", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text || "Request failed"}`);
  }

  return res.json();
}
