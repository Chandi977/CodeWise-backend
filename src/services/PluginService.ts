import { Plugin, IPlugin } from '../models/Plugin.model';
import { NotFoundError } from '../middlewares/errorHandler.middleware';
import { logger } from '../utils/logger';

export class PluginService {
  async getAllPlugins(): Promise<IPlugin[]> {
    const plugins = await Plugin.find({ isActive: true, isPublic: true })
      .populate('author', 'name email')
      .sort({ downloads: -1, rating: -1 });

    return plugins;
  }

  async createPlugin(userId: string, data: any): Promise<IPlugin> {
    const plugin = await Plugin.create({
      ...data,
      author: userId,
      isActive: true,
    });

    logger.info(`Plugin created: ${plugin.name} by ${userId}`);
    return plugin;
  }

  async getPluginById(pluginId: string): Promise<IPlugin> {
    const plugin = await Plugin.findById(pluginId).populate('author', 'name email');

    if (!plugin) {
      throw new NotFoundError('Plugin');
    }

    return plugin;
  }

  async installPlugin(pluginId: string, userId: string): Promise<void> {
    const plugin = await Plugin.findById(pluginId);

    if (!plugin) {
      throw new NotFoundError('Plugin');
    }

    plugin.downloads += 1;
    await plugin.save();

    logger.info(`Plugin installed: ${pluginId} by ${userId}`);
  }
}
