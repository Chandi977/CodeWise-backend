import { User, IUser } from '../models/User.model';
import { Analysis } from '../models/Analysis.model';
import { Project } from '../models/Project.model';
import { NotFoundError } from '../types';
import { logger } from '../utils/logger';

export class UserService {
  /**
   * Get user details by ID (without password)
   */
  async getUserById(userId: string): Promise<IUser> {
    const user = await User.findById(userId).select('-password');
    if (!user) throw new NotFoundError('User');
    return user;
  }

  /**
   * Update allowed user fields (name, avatar, settings)
   */
  async updateUser(userId: string, updates: Partial<IUser>): Promise<IUser> {
    const user = await User.findById(userId);
    if (!user) throw new NotFoundError('User');

    const allowedUpdates = ['name', 'avatar', 'settings'];
    Object.keys(updates).forEach((key) => {
      if (allowedUpdates.includes(key)) {
        (user as any)[key] = (updates as any)[key];
      }
    });

    await user.save();
    logger.info(`✅ User updated: ${userId}`);

    // Remove password before returning
    user.password = undefined as any;
    return user;
  }

  /**
   * Get user's project/analysis stats and recent activity
   */
  async getUserStats(userId: string): Promise<{
    projects: number;
    analyses: number;
    recentActivity: any[];
  }> {
    const [projectCount, analysisCount, recentActivity] = await Promise.all([
      // Count user projects (either owned or as member)
      Project.countDocuments({
        $or: [{ owner: userId }, { 'members.user': userId }],
        status: 'active',
      }),

      // Count analyses triggered by user
      Analysis.countDocuments({ triggeredBy: userId }),

      // Fetch recent analyses (avoid TS2590 using `.lean()`)
      Analysis.find({ triggeredBy: userId })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('createdAt status duration')
        .populate('project', 'name')
        .lean() as any, // ✅ Fixes TS2590 & boosts performance
    ]);

    return {
      projects: projectCount,
      analyses: analysisCount,
      recentActivity,
    };
  }

  /**
   * Fetch all active users
   */
  async getAllUsers(): Promise<IUser[]> {
    const users = await User.find({ isActive: true }).select('-password').sort({ createdAt: -1 });

    return users;
  }
}
