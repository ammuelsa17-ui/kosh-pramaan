const BACKEND_BASE_URL = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL !== undefined
  ? import.meta.env.VITE_API_URL
  : (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.PROD ? '' : 'http://localhost:5001');

/**
 * Fetch health status from backend REST endpoint.
 * Returns { ok: true, data: { status, service, system, timestamp } } or { ok: false, error: string }
 */
export async function fetchBackendHealth() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(`${BACKEND_BASE_URL}/api/health`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: err.name === 'AbortError' ? 'Connection timeout' : (err.message || 'Cannot reach backend')
    };
  }
}
