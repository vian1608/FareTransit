import crypto from 'crypto';
import env from '../../config/env.mjs';

class GA4Service {
  constructor() {
    this.cachedToken = null;
    this.tokenExpiry = 0;
  }

  base64url(str) {
    return Buffer.from(str)
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  // Get Google OAuth2 access token for Service Account
  async getAccessToken() {
    const now = Math.floor(Date.now() / 1000);
    if (this.cachedToken && this.tokenExpiry > now + 300) {
      return this.cachedToken;
    }

    const clientEmail = env.ga4ClientEmail || process.env.GA4_CLIENT_EMAIL;
    let privateKey = env.ga4PrivateKey || process.env.GA4_PRIVATE_KEY;

    if (!clientEmail || !privateKey) {
      throw new Error('GA4 service account credentials missing in environment variables.');
    }

    // Handle escaped newlines in Vercel environment variables
    if (privateKey.includes('\\n')) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    const header = this.base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = this.base64url(JSON.stringify({
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    }));

    const signatureInput = `${header}.${claim}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signatureInput);
    const signature = this.base64url(signer.sign(privateKey));
    const jwtToken = `${signatureInput}.${signature}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwtToken
      })
    });

    const data = await res.json();
    if (!res.ok || !data.access_token) {
      throw new Error(`Google OAuth authentication failed: ${data.error_description || data.error || 'Unknown error'}`);
    }

    this.cachedToken = data.access_token;
    this.tokenExpiry = now + (data.expires_in || 3600);
    return this.cachedToken;
  }

  // Realtime Active Users Report (runRealtimeReport)
  async getRealtimeActiveUsers() {
    try {
      const token = await this.getAccessToken();
      const propertyId = env.ga4PropertyId || process.env.GA4_PROPERTY_ID || '456789123';

      const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runRealtimeReport`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          metrics: [{ name: 'activeUsers' }]
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'GA4 Realtime API request failed');
      }

      const activeUsers = parseInt(data.rows?.[0]?.metricValues?.[0]?.value || '0', 10);
      return { activeUsers, liveStatus: 'ok' };
    } catch (err) {
      console.warn('[GA4 Integration Notice] Realtime report notice:', err.message);
      return { activeUsers: 0, liveStatus: 'unlinked', notice: err.message };
    }
  }

  // Historical Analytics Report (runReport)
  async getAnalyticsSummary(days = 30) {
    try {
      const token = await this.getAccessToken();
      const propertyId = env.ga4PropertyId || process.env.GA4_PROPERTY_ID || '456789123';

      const startDate = `${days}daysAgo`;
      const endDate = 'today';

      // 1. Overall Summary Metrics
      const summaryRes = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate }],
          metrics: [
            { name: 'activeUsers' },
            { name: 'sessions' },
            { name: 'screenPageViews' },
            { name: 'engagementRate' }
          ]
        })
      });
      const summaryData = await summaryRes.json();
      if (!summaryRes.ok) {
        throw new Error(summaryData.error?.message || 'GA4 Summary Report request failed');
      }

      // 2. Daily Visitors Trend
      const trendRes = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          dateRanges: [{ startDate: '14daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'date' }],
          metrics: [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }],
          orderBys: [{ dimension: { dimensionName: 'date' } }]
        })
      });
      const trendData = await trendRes.json();

      // 3. Traffic Sources
      const sourcesRes = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: 'sessionSource' }],
          metrics: [{ name: 'activeUsers' }],
          limit: 6
        })
      });
      const sourcesData = await sourcesRes.json();

      // 4. Device Categories
      const devicesRes = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: 'deviceCategory' }],
          metrics: [{ name: 'activeUsers' }]
        })
      });
      const devicesData = await devicesRes.json();

      // Parse Metrics
      const row0 = summaryData.rows?.[0]?.metricValues || [];
      const totalVisitors = parseInt(row0[0]?.value || '0', 10);
      const totalSessions = parseInt(row0[1]?.value || '0', 10);
      const pageViews = parseInt(row0[2]?.value || '0', 10);
      const engagementRate = parseFloat(row0[3]?.value || '0') * 100;

      const dailyTrend = (trendData.rows || []).map(r => ({
        date: r.dimensionValues?.[0]?.value || '',
        users: parseInt(r.metricValues?.[0]?.value || '0', 10),
        sessions: parseInt(r.metricValues?.[1]?.value || '0', 10),
        views: parseInt(r.metricValues?.[2]?.value || '0', 10)
      }));

      const trafficSources = (sourcesData.rows || []).map(r => ({
        source: r.dimensionValues?.[0]?.value || 'Direct',
        users: parseInt(r.metricValues?.[0]?.value || '0', 10)
      }));

      const deviceCategories = (devicesData.rows || []).map(r => ({
        category: r.dimensionValues?.[0]?.value || 'desktop',
        users: parseInt(r.metricValues?.[0]?.value || '0', 10)
      }));

      return {
        success: true,
        isLive: true,
        totalVisitors,
        totalSessions,
        pageViews,
        engagementRate: parseFloat(engagementRate.toFixed(1)),
        dailyTrend,
        trafficSources,
        deviceCategories
      };

    } catch (err) {
      console.warn('[GA4 Analytics Notice] Report generation fallback notice:', err.message);
      return {
        success: true,
        isLive: false,
        notice: `GA4 Access Notice: ${err.message}. To link live metrics, add service account email to GA4 Property as Viewer.`,
        totalVisitors: 0,
        totalSessions: 0,
        pageViews: 0,
        engagementRate: 0.0,
        dailyTrend: [],
        trafficSources: [],
        deviceCategories: []
      };
    }
  }
}

export default new GA4Service();
