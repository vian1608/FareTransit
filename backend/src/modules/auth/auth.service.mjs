import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import authRepository from './auth.repository.mjs';
import env from '../../config/env.mjs';

export const authService = {
  register: async (userData) => {
    const existing = await authRepository.findUserByEmail(userData.email);
    if (existing) {
      const err = new Error('User already exists with this email');
      err.statusCode = 400;
      err.code = 'USER_ALREADY_EXISTS';
      throw err;
    }

    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const user = await authRepository.createUser({
      ...userData,
      password: hashedPassword
    });

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      env.jwtSecret,
      { expiresIn: env.jwtExpiresIn }
    );

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        role: user.role
      }
    };
  },

  login: async (email, password) => {
    const user = await authRepository.findUserByEmail(email);
    if (!user) {
      const err = new Error('Invalid credentials');
      err.statusCode = 401;
      err.code = 'INVALID_CREDENTIALS';
      throw err;
    }

    if (!user.is_active) {
      const err = new Error('Account is deactivated');
      err.statusCode = 403;
      err.code = 'ACCOUNT_DEACTIVATED';
      throw err;
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      const err = new Error('Invalid credentials');
      err.statusCode = 401;
      err.code = 'INVALID_CREDENTIALS';
      throw err;
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      env.jwtSecret,
      { expiresIn: env.jwtExpiresIn }
    );

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        role: user.role
      }
    };
  },

  verifyUserToken: async (token) => {
    const decoded = jwt.verify(token, env.jwtSecret);
    const user = await authRepository.findUserById(decoded.userId);

    if (!user) {
      const err = new Error('User not found');
      err.statusCode = 401;
      err.code = 'USER_NOT_FOUND';
      throw err;
    }

    if (!user.is_active) {
      const err = new Error('Account is deactivated');
      err.statusCode = 403;
      err.code = 'ACCOUNT_DEACTIVATED';
      throw err;
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        role: user.role,
        dateOfBirth: user.date_of_birth,
        gender: user.gender,
        nationality: user.nationality
      }
    };
  }
};

export default authService;
