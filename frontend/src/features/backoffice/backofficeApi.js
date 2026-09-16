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

export async function backofficeBlobFetch(path) {
  const token = localStorage.getItem('token');
  const response = await fetch(`/api/backoffice${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (response.status === 401) {
    localStorage.removeItem('token');
    sessionStorage.removeItem('adminSession');
    window.location.assign('/admin/login');
    throw new Error('Your session has expired.');
  }
  if (!response.ok) {
    const contentType = response.headers.get('content-type') || '';
    let message = 'Unable to load authorization evidence.';
    let code = 'BACKOFFICE_FILE_REQUEST_FAILED';
    if (contentType.includes('application/json')) {
      const payload = await response.json().catch(() => ({}));
      message = payload?.error?.message || payload?.message || message;
      code = payload?.error?.code || code;
    }
    const error = new Error(message);
    error.code = code;
    throw error;
  }
  return response.blob();
}

export const boGet = path => backofficeFetch(path);
export const boPost = (path, body) => backofficeFetch(path, { method: 'POST', body: JSON.stringify(body) });
export const boPatch = (path, body) => backofficeFetch(path, { method: 'PATCH', body: JSON.stringify(body) });
export const boPut = (path, body) => backofficeFetch(path, { method: 'PUT', body: JSON.stringify(body) });
