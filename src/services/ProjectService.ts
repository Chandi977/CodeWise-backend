/* eslint-disable @typescript-eslint/no-explicit-any */
import { Project, IProject } from '../models/Project.model';
import { NotFoundError, AuthorizationError } from '../types';
import { logger } from '../utils/logger';
import * as fsPromises from 'fs/promises';
import path from 'path';
import extract from 'extract-zip';
import { AnalysisEngine } from '../analysis/AnalysisEngine';

export class ProjectService {
  /**
   * Get all projects owned by or shared with a specific user.
   */
  async getUserProjects(userId: string): Promise<IProject[]> {
    return await Project.find({
      $or: [{ owner: userId }, { 'members.user': userId }],
      status: 'active',
    })
      .populate('owner', 'name email')
      .populate('members.user', 'name email')
      .sort({ updatedAt: -1 });
  }

  /**
   * Create a new project and handle file upload (ZIP or single file).
   */
  async createProject(data: any): Promise<IProject> {
    const { name, description, repository, settings, owner, file } = data;

    // Step 1️⃣ — Create DB entry
    const project = await Project.create({
      name,
      description,
      owner,
      repository: repository || { type: 'upload' },
      settings: settings || {},
      members: [{ user: owner, role: 'owner' }],
    });

    if (file) {
      const baseDir = path.resolve(__dirname, '..', '..', 'uploads', 'projects');
      const projectDir = path.join(baseDir, String(project._id));
      await fsPromises.mkdir(projectDir, { recursive: true });

      const uploadedPath = path.resolve(file.path);

      try {
        if (file.mimetype.includes('zip')) {
          logger.info(`📦 Extracting ZIP for project: ${project.name}`);
          await extract(uploadedPath, { dir: projectDir });
          logger.info(`✅ Extraction complete: ${projectDir}`);

          // ✅ Fix deeply nested folders (backend/backend, project/project/src, etc.)
          await this.flattenAllNestedCodeFolders(projectDir);
        } else {
          const dest = path.join(projectDir, path.basename(file.originalname));
          await fsPromises.copyFile(uploadedPath, dest);
          logger.info(`📁 Uploaded single file: ${dest}`);
        }

        // Cleanup temporary upload
        await fsPromises.unlink(uploadedPath).catch(() => {});
      } catch (err: any) {
        logger.error(`File handling failed for project ${project._id}: ${err.message}`);
        throw new Error(`Project file processing failed: ${err.message}`);
      }
    }

    logger.info(`✅ Project created successfully: ${project.name} by ${owner}`);
    return project;
  }

  /**
   * Retrieve a project and verify access rights.
   */
  async getProjectById(projectId: string, userId: string): Promise<IProject> {
    const project = await Project.findById(projectId)
      .populate('owner', 'name email')
      .populate('members.user', 'name email');

    if (!project) throw new NotFoundError('Project');
    if (!this.hasAccess(project, userId))
      throw new AuthorizationError('You do not have access to this project');

    return project;
  }

  /**
   * Update editable fields.
   */
  async updateProject(
    projectId: string,
    userId: string,
    updates: Partial<IProject>,
  ): Promise<IProject> {
    const project = await Project.findById(projectId);
    if (!project) throw new NotFoundError('Project');
    if (!this.hasWriteAccess(project, userId))
      throw new AuthorizationError('You do not have permission to update this project');

    const allowed = ['name', 'description', 'settings', 'tags'];
    for (const key of Object.keys(updates)) {
      if (allowed.includes(key)) (project as any)[key] = (updates as any)[key];
    }

    await project.save();
    logger.info(`📝 Project updated: ${projectId}`);
    return project;
  }

  /**
   * Archive project (soft delete).
   */
  async deleteProject(projectId: string, userId: string): Promise<void> {
    const project = await Project.findById(projectId);
    if (!project) throw new NotFoundError('Project');
    if (project.owner.toString() !== userId)
      throw new AuthorizationError('Only the owner can delete this project');

    project.status = 'archived';
    await project.save();
    logger.info(`🗃️ Project archived: ${projectId}`);
  }

  /**
   * Analyze the codebase using AnalysisEngine.
   */
  async getProjectMetrics(projectId: string): Promise<any> {
    const project = await Project.findById(projectId);
    if (!project) throw new NotFoundError('Project');

    const projectDir = path.resolve(
      __dirname,
      '..',
      '..',
      'uploads',
      'projects',
      String(projectId),
    );

    // 🔍 Auto-detect most likely root folder containing code
    const possibleRoots = [
      path.join(projectDir, 'backend', 'src'),
      path.join(projectDir, 'backend'),
      path.join(projectDir, 'src'),
      path.join(projectDir, 'server'),
      projectDir,
    ];

    let targetDir = projectDir;
    for (const dir of possibleRoots) {
      if (await this.pathExists(dir)) {
        targetDir = dir;
        break;
      }
    }

    logger.info(`🧩 Starting analysis in folder: ${targetDir}`);

    const engine = new AnalysisEngine();
    const result = await engine.analyzeCodebase(targetDir);

    // 🧮 Update project metrics
    project.metrics = {
      totalFiles: result.totalFiles,
      linesOfCode: result.metrics.totalLinesOfCode,
      complexity: result.metrics.averageComplexity,
      maintainabilityIndex: result.metrics.maintainabilityIndex,
      lastAnalyzed: new Date(),
    } as any;

    await project.save();
    logger.info(`📊 Metrics successfully updated for project: ${projectId}`);

    return project.metrics;
  }

  /**
   * Add or update a project member.
   */
  async addMember(
    projectId: string,
    ownerId: string,
    userId: string,
    role: string,
  ): Promise<IProject> {
    const project = await Project.findById(projectId);
    if (!project) throw new NotFoundError('Project');
    if (!this.hasWriteAccess(project, ownerId))
      throw new AuthorizationError('You do not have permission to add members');

    const existing = project.members.find((m) => m.user.toString() === userId);
    if (existing) existing.role = role as any;
    else project.members.push({ user: userId as any, role: role as any });

    await project.save();
    logger.info(`👥 Member added/updated: ${userId} in project ${projectId}`);
    return project;
  }

  // --- 🔒 PRIVATE HELPERS ---

  private hasAccess(project: IProject, userId: string): boolean {
    return (
      project.owner.toString() === userId ||
      project.members.some((m) => m.user.toString() === userId)
    );
  }

  private hasWriteAccess(project: IProject, userId: string): boolean {
    if (project.owner.toString() === userId) return true;
    const member = project.members.find((m) => m.user.toString() === userId);
    return member?.role === 'owner' || member?.role === 'maintainer';
  }

  private async pathExists(p: string): Promise<boolean> {
    try {
      await fsPromises.access(p);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 🧩 Flatten ANY nested folders containing 'src', 'server', or 'backend'
   */
  private async flattenAllNestedCodeFolders(baseDir: string): Promise<void> {
    const entries = await fsPromises.readdir(baseDir);
    const candidates = ['backend', 'src', 'server', 'code', 'app'];

    for (const entry of entries) {
      const fullPath = path.join(baseDir, entry);
      if (!(await this.pathExists(fullPath))) continue;

      for (const folder of candidates) {
        const nestedPath = path.join(fullPath, folder);
        if (await this.pathExists(nestedPath)) {
          logger.info(`📁 Flattening nested ${folder} folder inside ${entry}`);
          await this.copyRecursive(nestedPath, baseDir);
        }
      }
    }
  }

  private async copyRecursive(src: string, dest: string): Promise<void> {
    const entries = await fsPromises.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await fsPromises.mkdir(destPath, { recursive: true });
        await this.copyRecursive(srcPath, destPath);
      } else {
        await fsPromises.copyFile(srcPath, destPath);
      }
    }
  }
}

export const projectService = new ProjectService();
