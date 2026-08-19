export async function backofficeFetch(path, options = {}) {
  const token = localStorage.getItem('token');
  const response = await fetch(`/api/backoffice${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    localStorage.removeItem('token');
    sessionStorage.removeItem('adminSession');
    window.location.assign('/admin/login');
    throw new Error('Your session has expired.');
  }
  if (!response.ok || payload?.success === false) {
    const error = new Error(payload?.error?.message || payload?.message || 'Back-office request failed.');
    error.code = payload?.error?.code || 'BACKOFFICE_REQUEST_FAILED';
    throw error;
  }
  return payload?.data;
}

export const boGet = path => backofficeFetch(path);
export const boPost = (path, body) => backofficeFetch(path, { method: 'POST', body: JSON.stringify(body) });
export const boPatch = (path, body) => backofficeFetch(path, { method: 'PATCH', body: JSON.stringify(body) });
export const boPut = (path, body) => backofficeFetch(path, { method: 'PUT', body: JSON.stringify(body) });
