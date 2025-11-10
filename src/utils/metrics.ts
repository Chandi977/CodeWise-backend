export class MetricsCollector {
  private metrics: Map<string, any>;

  constructor() {
    this.metrics = new Map();
  }

  recordAnalysisDuration(duration: number) {
    this.record('analysis_duration', duration);
  }

  recordIssueCount(count: number, type: string) {
    this.record(`issues_${type}`, count);
  }

  recordApiRequest(endpoint: string, duration: number) {
    this.record(`api_${endpoint}`, duration);
  }

  private record(key: string, value: any) {
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }
    this.metrics.get(key).push({
      value,
      timestamp: Date.now(),
    });
  }

  getMetrics(key: string) {
    return this.metrics.get(key) || [];
  }

  clearMetrics() {
    this.metrics.clear();
  }
}
