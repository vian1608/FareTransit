const TOKEN_URL = 'https://auth.verygoodsecurity.com/auth/realms/vgs/protocol/openid-connect/token';
let cachedToken = null;

const asPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export function getVgsVaultConfig() {
  const vaultId = String(process.env.VGS_VAULT_ID || '').trim();
  const environment = String(process.env.VGS_ENVIRONMENT || 'sandbox').trim().toLowerCase();
  const clientId = String(process.env.VGS_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.VGS_CLIENT_SECRET || '').trim();
  const collectRouteId = String(process.env.VGS_COLLECT_ROUTE_ID || '').trim();
  const collectCname = String(process.env.VGS_COLLECT_CNAME || '').trim();
  const showCname = String(process.env.VGS_SHOW_CNAME || '').trim();
  const targetCvvTtlHours = asPositiveInt(process.env.VGS_CVV_TTL_HOURS, 24);
  const cvvTtlConfirmed = String(process.env.VGS_CVV_TTL_CONFIRMED || 'false').toLowerCase() === 'true';
  const sandboxDefaultCvvTtlHours = 1;
  const usesSandboxDefaultTtl = environment === 'sandbox' && !cvvTtlConfirmed;
  const effectiveCvvTtlHours = usesSandboxDefaultTtl ? sandboxDefaultCvvTtlHours : targetCvvTtlHours;
  const ttlReady = environment === 'sandbox' || cvvTtlConfirmed;
  const publicLinkHours = asPositiveInt(process.env.SECURE_PAYMENT_PUBLIC_LINK_HOURS, 48);
  const otpMinutes = asPositiveInt(process.env.SECURE_PAYMENT_OTP_MINUTES, 5);
  const accessMinutes = asPositiveInt(process.env.SECURE_PAYMENT_ACCESS_MINUTES, 5);
  return {
    vaultId,
    environment,
    clientId,
    clientSecret,
    collectRouteId,
    collectCname,
    showCname,
    targetCvvTtlHours,
    effectiveCvvTtlHours,
    sandboxDefaultCvvTtlHours,
    usesSandboxDefaultTtl,
    ttlReady,
    cvvTtlConfirmed,
    publicLinkHours,
    otpMinutes,
    accessMinutes,
    configured: Boolean(vaultId && clientId && clientSecret),
  };
}

export function getSafeVgsVaultConfig() {
  const config = getVgsVaultConfig();
  const sandboxCollectScript = 'https://js.verygoodvault.com/vgs-collect/3.2.2/vgs-collect.js';
  const liveCollectScript = 'https://js.verygoodvault.com/vgs-collect/3.3.0/vgs-collect.js';
  return {
    provider: 'VGS',
    vaultId: config.vaultId || null,
    environment: config.environment,
    collectRouteId: config.collectRouteId || null,
    collectCname: config.collectCname || null,
    showCname: config.showCname || null,
    targetCvvTtlHours: config.targetCvvTtlHours,
    effectiveCvvTtlHours: config.effectiveCvvTtlHours,
    sandboxDefaultCvvTtlHours: config.sandboxDefaultCvvTtlHours,
    usesSandboxDefaultTtl: config.usesSandboxDefaultTtl,
    ttlReady: config.ttlReady,
    cvvTtlConfirmed: config.cvvTtlConfirmed,
    configured: config.configured,
    collectEnabled: config.configured && config.ttlReady,
    otpMinutes: config.otpMinutes,
    accessMinutes: config.accessMinutes,
    // VGS currently documents 3.2.2 in the Collect JS quick-start. Use that
    // unpinned-SRI sandbox path for test mode, while keeping the integrity-pinned
    // 3.3.0 script for Live.
    collectScript: config.environment === 'sandbox' ? sandboxCollectScript : liveCollectScript,
    collectIntegrity: config.environment === 'sandbox' ? null : 'sha384-YXvleED0q049Gx5rqUHI/hOTud/jKaLiL757lVq26oVFAd9SjTDHBoOviWw6XmPo',
    showScript: 'https://js.verygoodvault.com/vgs-show/2.2.2/show.js',
  };
}

export async function getVgsAccessToken() {
  const config = getVgsVaultConfig();
  if (!config.configured) {
    const error = new Error('VGS secure vault credentials are not configured.');
    error.statusCode = 503;
    error.code = 'VGS_NOT_CONFIGURED';
    throw error;
  }
  const now = Date.now();
  if (cachedToken?.accessToken && cachedToken.expiresAt > now + 30_000) return cachedToken.accessToken;

  const body = new URLSearchParams();
  body.set('grant_type', 'client_credentials');
  body.set('client_id', config.clientId);
  body.set('client_secret', config.clientSecret);
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    const error = new Error('Unable to obtain a VGS access token.');
    error.statusCode = 502;
    error.code = 'VGS_AUTH_FAILED';
    throw error;
  }
  cachedToken = {
    accessToken: payload.access_token,
    expiresAt: now + Math.max(60, Number(payload.expires_in || 300)) * 1000,
  };
  return cachedToken.accessToken;
}

function vaultApiBase(config) {
  if (!config.vaultId) throw new Error('VGS vault ID is missing.');
  return `https://${config.vaultId}.${config.environment}.vault-api.verygoodvault.com`;
}

export async function deleteVgsVolatileAlias(alias) {
  if (!alias) return { deleted: true, alreadyMissing: true };
  const config = getVgsVaultConfig();
  const token = await getVgsAccessToken();
  const response = await fetch(`${vaultApiBase(config)}/aliases/${encodeURIComponent(alias)}?storage=VOLATILE`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 204 || response.status === 404) {
    return { deleted: true, alreadyMissing: response.status === 404 };
  }
  const error = new Error('VGS could not delete the volatile CVV alias.');
  error.statusCode = 502;
  error.code = 'VGS_CVV_DELETE_FAILED';
  throw error;
}

export default {
  getConfig: getVgsVaultConfig,
  getSafeConfig: getSafeVgsVaultConfig,
  getAccessToken: getVgsAccessToken,
  deleteVolatileAlias: deleteVgsVolatileAlias,
};
