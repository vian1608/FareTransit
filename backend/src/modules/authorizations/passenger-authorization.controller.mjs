import passengerAuthorizationService from './passenger-authorization.service.mjs';
import logger from '../../config/logger.mjs';

export const passengerAuthorizationController = {
  getAuthorization: async (req, res, next) => {
    try {
      const { token } = req.params;
      if (!token) {
        return res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'Authorization token is required' }
        });
      }

      const payload = await passengerAuthorizationService.getAuthorizationByToken(token);
      const state = String(payload?.status || payload?.authorizationStatus || '').toLowerCase();
      if (state === 'superseded' || state === 'reauthorization_required') {
        return res.status(409).json({
          success: false,
          error: {
            code: 'AUTHORIZATION_SUPERSEDED',
            message: 'This booking was updated after this authorization link was issued. Please use the newest authorization request.'
          }
        });
      }

      return res.json({
        success: true,
        authorization: payload
      });
    } catch (error) {
      if (error.message === 'AUTHORIZATION_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Authorization link was not found or has been removed.' }
        });
      }
      if (error.message === 'AUTHORIZATION_EXPIRED') {
        return res.status(410).json({
          success: false,
          error: { code: 'EXPIRED', message: 'This authorization link has expired. A new authorization link will be sent.' }
        });
      }
      if (error.message === 'AUTHORIZATION_INVALIDATED_PRICE_CHANGE' || error.message === 'AUTHORIZATION_SUPERSEDED') {
        return res.status(409).json({
          success: false,
          error: { code: 'INVALIDATED', message: 'The booking details or fare changed. A new authorization is required.' }
        });
      }
      logger.error(`Error in getAuthorization controller: ${error.message}`);
      return next(error);
    }
  },

  acceptAuthorization: async (req, res, next) => {
    try {
      const { token, acceptedText } = req.body;
      if (!token || !acceptedText) {
        return res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'Token and accepted authorization wording are required.' }
        });
      }

      let clientIp = null;
      const xForwardedFor = req.headers['x-forwarded-for'];
      if (xForwardedFor) {
        const ips = String(xForwardedFor).split(',').map(ip => ip.trim());
        clientIp = ips[0];
      }
      if (!clientIp) {
        clientIp = req.headers['x-real-ip'] || req.ip || (req.socket ? req.socket.remoteAddress : null) || null;
      }
      if (clientIp) {
        clientIp = String(clientIp).replace(/^::ffff:/, '');
        if (clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === 'localhost' || clientIp === '198.51.100.1') {
          if (process.env.NODE_ENV === 'production') {
            clientIp = null;
          }
        }
      }

      const userAgent = req.headers['user-agent'] || 'Browser Client';

      const result = await passengerAuthorizationService.acceptAuthorization({
        token,
        acceptedCheckboxText: acceptedText,
        clientIp,
        userAgent
      });

      return res.json(result);
    } catch (error) {
      if (error.message.includes('SUPERSEDED')) {
        return res.status(409).json({
          success: false,
          error: { code: 'AUTHORIZATION_SUPERSEDED', message: 'This booking changed after the authorization link was issued. Please use the newest authorization request.' }
        });
      }
      if (error.message.includes('ALREADY')) {
        return res.status(400).json({
          success: false,
          error: { code: 'ALREADY_ACCEPTED', message: 'This booking has already been authorized.' }
        });
      }
      if (error.message === 'AUTHORIZATION_EXPIRED') {
        return res.status(410).json({
          success: false,
          error: { code: 'EXPIRED', message: 'This authorization request has expired.' }
        });
      }
      logger.error(`Error accepting authorization: ${error.message}`);
      return next(error);
    }
  },

  getEvidenceExport: async (req, res, next) => {
    try {
      const { id } = req.params;
      const evidence = await passengerAuthorizationService.generateAuditEvidenceExport(id);
      return res.json({
        success: true,
        evidence
      });
    } catch (error) {
      logger.error(`Error generating evidence export for booking ${req.params.id}: ${error.message}`);
      return next(error);
    }
  }
};

export default passengerAuthorizationController;
