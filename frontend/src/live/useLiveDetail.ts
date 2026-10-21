import { useEffect, useState } from "react";
import { reauthAwareFetch } from "../authFetch";

// Polls one /api/live endpoint while its view is on screen. Keeps showing
// the last good response through a failed poll rather than blanking the
// display over one dropped request.
export function useLiveDetail<T>(url: string | null, intervalMs: number): { data: T | null; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    if (!url) return;
    let cancelled = false;
    const load = async () => {
      try {
        const r = await reauthAwareFetch(url);
        if (!r || cancelled) return;
        const body = await r.json();
        if (cancelled) return;
        if (!r.ok) setError(body?.error ?? `HTTP ${r.status}`);
        else {
          setData(body as T);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("Could not reach the server");
      }
    };
    load();
    const id = setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [url, intervalMs]);

  return { data, error };
}
