import { User, IUser } from '../models/User.model';
import { JWTService } from './JWTService';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middlewares/errorHandler.middleware';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  private jwtService: JWTService;

  constructor() {
    this.jwtService = new JWTService();
  }

  /**
   * 🧩 Register a new user
   */
  async register(data: {
    email: string;
    password: string;
    name: string;
  }): Promise<{ user: IUser; tokens: AuthTokens }> {
    const existingUser = await User.findOne({ email: data.email });
    if (existingUser) {
      throw new Error('User already exists with this email');
    }

    const user = await User.create({
      email: data.email,
      password: data.password,
      name: data.name,
      role: 'developer',
    });

    const tokens = this.jwtService.generateTokens({
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    logger.info(`✅ New user registered: ${user.email}`);

    // remove sensitive fields
    user.password = undefined as any;
    return { user, tokens };
  }

  /**
   * 🔑 Login existing user
   */
  async login(email: string, password: string): Promise<{ user: IUser; tokens: AuthTokens }> {
    const user = await User.findOne({ email }).select('+password');
    if (!user) throw new Error('Invalid credentials');

    if (!user.isActive) throw new Error('Account is deactivated');

    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) throw new Error('Invalid credentials');

    user.lastLogin = new Date();
    await user.save();

    const tokens = this.jwtService.generateTokens({
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    user.password = undefined as any;
    logger.info(`🔓 User logged in: ${user.email}`);

    return { user, tokens };
  }

  /**
   * ♻️ Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<string> {
    const payload = this.jwtService.verifyRefreshToken(refreshToken);

    const user = await User.findById(payload.id);
    if (!user || !user.isActive) throw new Error('Invalid refresh token');

    return this.jwtService.generateAccessToken({
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    });
  }

  /**
   * 🚪 Logout user (invalidate refresh token)
   */
  async logout(userId: string): Promise<void> {
    // In production, you can store invalid refresh tokens in Redis
    logger.info(`🚪 User logged out: ${userId}`);
  }

  /**
   * 🔐 Change password
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await User.findById(userId).select('+password');
    if (!user) throw new NotFoundError('User');

    const isValid = await user.comparePassword(currentPassword);
    if (!isValid) throw new Error('Current password is incorrect');

    user.password = newPassword;
    await user.save();

    logger.info(`🔄 Password changed for user: ${user.email}`);
  }

  /**
   * ✉️ Request password reset
   */
  async requestPasswordReset(email: string): Promise<string> {
    const user = await User.findOne({ email });
    if (!user) {
      // Don’t reveal user existence
      return 'If the email exists, a reset link has been sent';
    }

    const resetToken = this.jwtService.generateResetToken({
      id: user._id.toString(),
      email: user.email,
    });

    // TODO: integrate email service (SendGrid, SES, etc.)
    logger.info(`📧 Password reset requested for: ${email}`);

    return resetToken;
  }

  /**
   * 🔁 Reset password using reset token
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const payload = this.jwtService.verifyResetToken(token);

    const user = await User.findById(payload.id);
    if (!user) throw new NotFoundError('User');

    user.password = newPassword;
    await user.save();

    logger.info(`✅ Password reset for user: ${user.email}`);
  }
}
