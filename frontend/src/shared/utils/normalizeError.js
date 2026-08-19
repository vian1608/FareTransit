/**
 * normalizeError.js
 *
 * Safely extracts a human-readable string from any thrown value or Axios
 * error response so React never receives a plain object as a child, which
 * would trigger React Minified Error #31.
 *
 * Resolution order:
 *  1. err.response.data.error.message   — API sends { error: { code, message } }
 *  2. err.response.data.error            — API sends { error: "string" }
 *  3. err.response.data.message          — API sends { message: "string" }
 *  4. err.message                        — native Error / Axios message
 *  5. fallback                           — caller-supplied default
 */
export function normalizeError(err, fallback = 'Something went wrong. Please try again.') {
  if (!err) return fallback;

  // 0. Handle cancellation, timeouts, and network disconnects
  const errName = String(err?.name || '');
  const errCode = String(err?.code || '');
  const errMessage = String(err?.message || '').toLowerCase();

  if (
    errName === 'CanceledError' ||
    errName === 'AbortError' ||
    errCode === 'ERR_CANCELED' ||
    errCode === 'ECONNABORTED' ||
    errCode === 'ETIMEDOUT' ||
    errMessage.includes('canceled') ||
    errMessage.includes('aborted')
  ) {
    return 'The request was canceled or timed out. Please try again.';
  }

  if (errCode === 'ERR_NETWORK' || errMessage.includes('network error')) {
    return 'Network connection error. Please check your internet connection and try again.';
  }

  // 1. Axios-style response body with { error: { code, message } }
  const responseError = err?.response?.data?.error;
  if (responseError) {
    if (typeof responseError === 'string') return responseError;
    if (typeof responseError?.message === 'string') return responseError.message;
    // Object with no message — stringify safely
    try { return JSON.stringify(responseError); } catch (_) { /* fall through */ }
  }

  // 2. Axios-style response body with { message: "..." }
  const responseMessage = err?.response?.data?.message;
  if (typeof responseMessage === 'string' && responseMessage) return responseMessage;

  // 3. Native Error / Axios top-level message
  if (typeof err?.message === 'string' && err.message) return err.message;

  // 4. Caller fallback
  return fallback;
}
