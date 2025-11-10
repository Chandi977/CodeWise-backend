import { PluginService } from '../services/PluginService';
import { Router } from 'express';
const pluginRouter = Router();
const pluginService = new PluginService();

// @route   GET /api/v1/plugins
// @desc    Get all plugins
// @access  Private
pluginRouter.get('/', async (_req: any, res, next) => {
  try {
    const plugins = await pluginService.getAllPlugins();

    res.json({
      success: true,
      data: plugins,
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/v1/plugins
// @desc    Create new plugin
// @access  Private
pluginRouter.post('/', async (req: any, res, next) => {
  try {
    const plugin = await pluginService.createPlugin(req.user.id, req.body);

    res.status(201).json({
      success: true,
      message: 'Plugin created successfully',
      data: plugin,
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/v1/plugins/:id
// @desc    Get plugin by ID
// @access  Private
pluginRouter.get('/:id', async (req: any, res, next) => {
  try {
    const plugin = await pluginService.getPluginById(req.params.id);

    res.json({
      success: true,
      data: plugin,
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/v1/plugins/:id/install
// @desc    Install plugin
// @access  Private
pluginRouter.post('/:id/install', async (req: any, res, next) => {
  try {
    await pluginService.installPlugin(req.params.id, req.user.id);

    res.json({
      success: true,
      message: 'Plugin installed successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default pluginRouter;
