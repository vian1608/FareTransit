import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import backofficeRepository from '../backoffice/backoffice.repository.mjs';

const MERCHANT_TEST_EMAIL = 'merchant-test@faretransit.com';

function newTemporaryPassword() {
  return `FTdemo-${crypto.randomBytes(12).toString('base64url')}`;
}

export const adminDemoController = {
  async resetMerchantTestCredentials(req, res, next) {
    try {
      const staff = await backofficeRepository.findStaffByEmail(MERCHANT_TEST_EMAIL);
      if (!staff || staff.role?.key !== 'merchant_test') {
        return res.status(404).json({
          success: false,
          error: { code: 'MERCHANT_TEST_ACCOUNT_NOT_FOUND', message: 'Merchant test account is not configured.' }
        });
      }

      const password = newTemporaryPassword();
      const passwordHash = await bcrypt.hash(password, 12);
      await backofficeRepository.updateStaff(staff.id, { password_hash: passwordHash, status: 'active' });

      return res.json({
        success: true,
        data: {
          email: staff.email,
          password,
          role: staff.role?.key || 'merchant_test',
          roleName: staff.role?.name || 'Merchant Test',
          note: 'This password is shown once and remains valid only until the next reset.'
        }
      });
    } catch (error) {
      next(error);
    }
  }
};

export default adminDemoController;
