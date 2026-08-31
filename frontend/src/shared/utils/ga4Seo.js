const ALLOWED_KEYS = new Set([
  'page_path',
  'link_path',
  'link_type',
  'content_group',
  'route_type',
  'trip_type',
  'travel_class',
  'step_name',
  'selected',
  'value',
  'currency',
]);

function sanitizeParams(params = {}) {
  const safe = {};
  for (const [key, value] of Object.entries(params)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (value === undefined || value === null || value === '') continue;
    safe[key] = typeof value === 'string' ? value.slice(0, 120) : value;
  }
  return safe;
}

export function trackGa4Event(eventName, params = {}) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return false;
  if (!/^[a-zA-Z][a-zA-Z0-9_]{1,39}$/.test(String(eventName || ''))) return false;

  try {
    window.gtag('event', eventName, sanitizeParams(params));
    return true;
  } catch {
    return false;
  }
}

export function trackSeoPageView(pagePath) {
  return trackGa4Event('seo_content_view', {
    page_path: pagePath,
    content_group: 'seo_content',
  });
}

export function trackSeoInternalClick({ pagePath, linkPath, linkType = 'internal' }) {
  return trackGa4Event('seo_internal_click', {
    page_path: pagePath,
    link_path: linkPath,
    link_type: linkType,
    content_group: 'seo_content',
  });
}
