import jwt from 'jsonwebtoken';

export interface JWTPayload {
  id: string;
  email: string;
  role?: string;
}

export class JWTService {
  private accessSecret: string;
  private refreshSecret: string;
  private resetSecret: string;

  constructor() {
    this.accessSecret = process.env.JWT_SECRET || 'your_jwt_secret';
    this.refreshSecret = process.env.JWT_REFRESH_SECRET || 'your_refresh_secret';
    this.resetSecret = process.env.JWT_RESET_SECRET || 'your_reset_secret';
  }

  /**
   * Generate access and refresh tokens
   */
  generateTokens(payload: JWTPayload) {
    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);

    return {
      accessToken,
      refreshToken,
      expiresIn: 24 * 60 * 60, // 1 day in seconds
    };
  }

  /**
   * Generate access token (1 day)
   */
  generateAccessToken(payload: JWTPayload): string {
    return jwt.sign(payload, this.accessSecret, {
      expiresIn: '1d',
    });
  }

  /**
   * Generate refresh token (7 days)
   */
  generateRefreshToken(payload: JWTPayload): string {
    return jwt.sign(payload, this.refreshSecret, {
      expiresIn: '7d', // remains the same
    });
  }

  /**
   * Generate password reset token (1 hour)
   */
  generateResetToken(payload: JWTPayload): string {
    return jwt.sign(payload, this.resetSecret, {
      expiresIn: '1h',
    });
  }

  /**
   * Verify access token
   */
  verifyAccessToken(token: string): JWTPayload {
    try {
      return jwt.verify(token, this.accessSecret) as JWTPayload;
    } catch (error) {
      throw new Error('Invalid or expired access token');
    }
  }

  /**
   * Verify refresh token
   */
  verifyRefreshToken(token: string): JWTPayload {
    try {
      return jwt.verify(token, this.refreshSecret) as JWTPayload;
    } catch (error) {
      throw new Error('Invalid or expired refresh token');
    }
  }

  /**
   * Verify reset token
   */
  verifyResetToken(token: string): JWTPayload {
    try {
      return jwt.verify(token, this.resetSecret) as JWTPayload;
    } catch (error) {
      throw new Error('Invalid or expired reset token');
    }
  }
}
