import authService from './auth.service.mjs';

export const authController = {
  register: async (req, res, next) => {
    try {
      const result = await authService.register(req.body);
      res.json({
        success: true,
        message: 'Account created successfully',
        ...result
      });
    } catch (error) {
      next(error);
    }
  },

  login: async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password);
      res.json({
        success: true,
        message: 'Login successful',
        ...result
      });
    } catch (error) {
      next(error);
    }
  },

  verify: async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.split(' ')[1];
      
      if (!token) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'No token provided' }
        });
      }

      const result = await authService.verifyUserToken(token);
      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      next(error);
    }
  }
};

export default authController;
