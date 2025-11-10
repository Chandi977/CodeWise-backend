export type IssueSeverity = 'error' | 'warning' | 'info';
export type IssueType = 'syntax' | 'logic' | 'performance' | 'security' | 'lint' | 'io';
export type SuggestionType = 'fix' | 'refactoring' | 'optimization' | 'security';

export interface CodeIssue {
  type: IssueType;
  severity: IssueSeverity;
  message: string;
  code: string;
  filePath: string;
  line: number;
  column: number;
  fix?: {
    description: string;
    code: string;
  };
}

export interface FileAnalysis {
  filePath: string;
  issues: CodeIssue[];
  metrics: {
    linesOfCode: number;
    complexity?: number;
    functions?: number;
    classes?: number;
    imports?: number;
  };
}

export interface MetricsData {
  totalLinesOfCode: number;
  averageComplexity: number;
  totalFunctions: number;
  totalClasses: number;
  issueBreakdown: {
    error: number;
    warning: number;
    info: number;
  };
  maintainabilityIndex: number;
}

export interface AnalysisResult {
  projectPath: string;
  totalFiles: number;
  analyzedFiles: number;
  issues: CodeIssue[];
  metrics: MetricsData;
  fileAnalyses: FileAnalysis[];
  duration: number;
  timestamp: Date;
}

// ============================================================================
// AI Suggestion Types
// ============================================================================

export interface AISuggestion {
  id: string;
  type: SuggestionType;
  title: string;
  description: string;
  suggestedCode?: string;
  reasoning: string;
  priority: 'high' | 'medium' | 'low';
  relatedIssues?: string[];
  confidence: number;
  createdAt: Date;
}

export interface CodeContext {
  filePath: string;
  code: string;
  linesOfCode: number;
  language: string;
  complexity: number;
}

// ============================================================================
// Project Types
// ============================================================================

export interface ProjectSettings {
  autoAnalysis: boolean;
  analysisSchedule?: string;
  qualityGates: {
    minCoverage: number;
    maxComplexity: number;
    maxIssues: number;
  };
  aiEnabled: boolean;
  aiProvider: string;
}

export interface RepositoryConfig {
  type: 'upload' | 'github' | 'gitlab';
  url?: string;
  branch?: string;
  accessToken?: string;
}

export interface ProjectMetrics {
  totalFiles: number;
  linesOfCode: number;
  complexity: number;
  maintainabilityIndex: number;
  lastAnalysis?: Date;
}

// ============================================================================
// Analysis Types
// ============================================================================

export interface AnalysisOptions {
  includeTests?: boolean;
  aiEnabled?: boolean;
  aiProvider?: string;
  detectors?: IssueType[];
  filePattern?: string[];
}

export interface AnalysisProgress {
  analysisId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  currentFile?: string;
  processedFiles: number;
  totalFiles: number;
  estimatedTimeRemaining?: number;
}

// ============================================================================
// WebSocket Events
// ============================================================================

export interface AnalysisProgressEvent {
  type: 'progress';
  analysisId: string;
  progress: number;
  currentFile: string;
}

export interface AnalysisCompleteEvent {
  type: 'complete';
  analysisId: string;
  results: AnalysisResult;
}

export interface AnalysisErrorEvent {
  type: 'error';
  analysisId: string;
  error: string;
}

export type AnalysisEvent = AnalysisProgressEvent | AnalysisCompleteEvent | AnalysisErrorEvent;

// ============================================================================
// Plugin Types
// ============================================================================

export type PluginType = 'rule' | 'analyzer' | 'reporter';

export interface PluginConfig {
  enabled: boolean;
  options?: Record<string, any>;
}

export interface PluginMetadata {
  name: string;
  version: string;
  description: string;
  author: string;
  type: PluginType;
}

export interface PluginHooks {
  beforeAnalysis?: (context: any) => void | Promise<void>;
  onFileAnalysis?: (file: string, result: FileAnalysis) => void | Promise<void>;
  afterAnalysis?: (result: AnalysisResult) => void | Promise<void>;
}

// ============================================================================
// User & Team Types
// ============================================================================

export interface UserSettings {
  theme: 'light' | 'dark';
  notifications: boolean;
  aiProvider: string;
}

export type UserRole = 'admin' | 'developer' | 'reviewer';
export type ProjectRole = 'owner' | 'maintainer' | 'viewer';

export interface TeamMember {
  userId: string;
  role: ProjectRole;
  joinedAt: Date;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: string[];
}

export interface PaginatedResponse<T> extends ApiResponse<T> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================================================
// Job Queue Types
// ============================================================================

export interface AnalysisJob {
  projectId: string;
  userId: string;
  options: AnalysisOptions;
  priority?: number;
}

export interface ReportJob {
  analysisId: string;
  format: 'pdf' | 'html' | 'json';
  includeCharts?: boolean;
}

// ============================================================================
// Error Types
// ============================================================================

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational: boolean = true,
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(401, message);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(404, `${resource} not found`);
  }
}

// ============================================================================
// Utility Types
// ============================================================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type Nullable<T> = T | null;

export type AsyncFunction<T = void> = (...args: any[]) => Promise<T>;

// ============================================================================
// Complexity Calculation Types
// ============================================================================

export interface ComplexityMetrics {
  cyclomatic: number;
  cognitive: number;
  halstead?: {
    volume: number;
    difficulty: number;
    effort: number;
  };
}

// ============================================================================
// Git Integration Types
// ============================================================================

export interface GitCommit {
  sha: string;
  message: string;
  author: string;
  date: Date;
  filesChanged: number;
}

export interface GitBranch {
  name: string;
  commit: string;
  protected: boolean;
}

export interface GitRepository {
  owner: string;
  name: string;
  url: string;
  defaultBranch: string;
  private: boolean;
}

// ============================================================================
// Report Types
// ============================================================================

export interface AnalysisReport {
  projectName: string;
  analysisDate: Date;
  summary: {
    totalIssues: number;
    criticalIssues: number;
    filesAnalyzed: number;
    linesOfCode: number;
  };
  issuesByType: Record<IssueType, number>;
  issuesBySeverity: Record<IssueSeverity, number>;
  trends?: {
    issueChange: number;
    complexityChange: number;
    coverageChange: number;
  };
  topIssues: CodeIssue[];
  recommendations: string[];
}

// ============================================================================
// Cache Types
// ============================================================================

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

// ============================================================================
// Notification Types
// ============================================================================

export type NotificationType =
  | 'analysis_complete'
  | 'critical_issue'
  | 'quality_gate_failed'
  | 'suggestion_available';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: any;
  read: boolean;
  createdAt: Date;
}
