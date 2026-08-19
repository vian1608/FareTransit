/**
 * Cache-Control middleware for FareTransit API.
 * 
 * Enforces strict 'no-store' headers on private data and write operations,
 * while allowing safe CDN caching for public, non-user-specific lookup data.
 */

/**
 * Strict no-store middleware for private, user-specific, or sensitive routes.
 * Prevents browser, proxy, and CDN caching of booking, payment, authorization, or admin data.
 */
export function noStore(req, res, next) {
  res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
}

/**
 * Global middleware enforcing no-store on all non-GET / non-HEAD write operations.
 * Prevents any POST, PUT, PATCH, DELETE request from returning cached headers.
 */
export function autoWriteNoStore(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
}

/**
 * Safe CDN caching middleware for public, non-sensitive lookup endpoints
 * (e.g. airport directory, address autocomplete, public configuration).
 * 
 * @param {number} seconds - Browser max-age (default 300s / 5 mins)
 * @param {number} cdnSeconds - Vercel CDN s-maxage (default 86400s / 24 hours)
 * @param {number} swrSeconds - Stale-while-revalidate duration (default 3600s / 1 hour)
 */
export function publicLookupCache(seconds = 300, cdnSeconds = 86400, swrSeconds = 3600) {
  return (req, res, next) => {
    // Only apply public caching to GET / HEAD requests
    if (req.method === 'GET' || req.method === 'HEAD') {
      res.setHeader('Cache-Control', `public, max-age=${seconds}`);
      res.setHeader('Vercel-CDN-Cache-Control', `public, s-maxage=${cdnSeconds}, stale-while-revalidate=${swrSeconds}`);
    } else {
      noStore(req, res, next);
      return;
    }
    next();
  };
}
