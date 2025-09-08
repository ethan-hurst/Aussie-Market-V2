/**
 * Centralized log aggregation and filtering system for Edge Functions
 * Provides structured log routing, filtering, and alerting capabilities
 */

export interface LogFilter {
  level?: 'info' | 'warn' | 'error' | 'debug';
  functionName?: string;
  errorCategory?: string;
  performanceCategory?: 'fast' | 'medium' | 'slow';
  timeRange?: {
    start: Date;
    end: Date;
  };
  tags?: Record<string, string>;
}

export interface AlertRule {
  id: string;
  name: string;
  condition: {
    field: string;
    operator: 'equals' | 'greater_than' | 'less_than' | 'contains' | 'regex';
    value: any;
  };
  threshold?: number;
  timeWindow?: number; // in minutes
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
}

export interface LogAggregationConfig {
  enableRealTimeAlerts: boolean;
  enablePerformanceMonitoring: boolean;
  enableErrorTracking: boolean;
  logRetentionDays: number;
  alertRules: AlertRule[];
}

export class LogAggregator {
  private config: LogAggregationConfig;
  private alertRules: Map<string, AlertRule>;
  private performanceThresholds: Map<string, number>;

  constructor(config: LogAggregationConfig) {
    this.config = config;
    this.alertRules = new Map(config.alertRules.map(rule => [rule.id, rule]));
    this.performanceThresholds = new Map([
      ['function_execution', 5000], // 5 seconds
      ['db_operation', 1000], // 1 second
      ['webhook_processing', 10000], // 10 seconds
      ['auction_processing', 30000] // 30 seconds
    ]);
  }

  /**
   * Process and route logs based on configuration
   */
  async processLog(logEntry: any): Promise<void> {
    try {
      // Route to appropriate handlers
      await Promise.all([
        this.routeToRealTimeAlerts(logEntry),
        this.routeToPerformanceMonitoring(logEntry),
        this.routeToErrorTracking(logEntry),
        this.routeToStorage(logEntry)
      ]);
    } catch (error) {
      console.error('Error processing log entry:', error);
    }
  }

  /**
   * Route logs to real-time alerting system
   */
  private async routeToRealTimeAlerts(logEntry: any): Promise<void> {
    if (!this.config.enableRealTimeAlerts) return;

    for (const rule of this.alertRules.values()) {
      if (!rule.enabled) continue;

      if (this.evaluateAlertCondition(logEntry, rule)) {
        await this.triggerAlert(rule, logEntry);
      }
    }
  }

  /**
   * Route logs to performance monitoring
   */
  private async routeToPerformanceMonitoring(logEntry: any): Promise<void> {
    if (!this.config.enablePerformanceMonitoring) return;

    // Check for performance issues using structured metadata
    if (logEntry.type === 'performance' || logEntry.context?.performance === true) {
      const operation = logEntry.context?.operation;
      const duration = logEntry.context?.duration_ms;
      
      if (operation && duration) {
        const threshold = this.performanceThresholds.get(operation) || 5000;
        
        if (duration > threshold) {
          await this.recordPerformanceAlert(operation, duration, threshold, logEntry);
        }
      }
    }
  }

  /**
   * Route logs to error tracking
   */
  private async routeToErrorTracking(logEntry: any): Promise<void> {
    if (!this.config.enableErrorTracking) return;

    if (logEntry.level === 'error') {
      await this.recordError(logEntry);
    }
  }

  /**
   * Route logs to persistent storage
   */
  private async routeToStorage(logEntry: any): Promise<void> {
    // This would integrate with your database or log storage system
    // For now, we'll just ensure structured logging
    console.log(JSON.stringify({
      type: 'structured_log',
      ...logEntry,
      processed_at: new Date().toISOString()
    }));
  }

  /**
   * Evaluate alert condition against log entry
   */
  private evaluateAlertCondition(logEntry: any, rule: AlertRule): boolean {
    const { field, operator, value } = rule.condition;
    
    // Navigate to the field value in the log entry
    const fieldValue = this.getNestedValue(logEntry, field);
    
    switch (operator) {
      case 'equals':
        return fieldValue === value;
      case 'greater_than':
        return typeof fieldValue === 'number' && fieldValue > value;
      case 'less_than':
        return typeof fieldValue === 'number' && fieldValue < value;
      case 'contains':
        return typeof fieldValue === 'string' && fieldValue.includes(value);
      case 'regex':
        return typeof fieldValue === 'string' && new RegExp(value).test(fieldValue);
      default:
        return false;
    }
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Trigger an alert
   */
  private async triggerAlert(rule: AlertRule, logEntry: any): Promise<void> {
    const alert = {
      id: crypto.randomUUID(),
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      message: `Alert triggered: ${rule.name}`,
      logEntry: {
        timestamp: logEntry.timestamp,
        level: logEntry.level,
        message: logEntry.message,
        context: logEntry.context
      },
      triggeredAt: new Date().toISOString()
    };

    // Log the alert
    console.log(JSON.stringify({
      type: 'alert_triggered',
      ...alert
    }));

    // In a real implementation, this would send to your alerting system
    // (Slack, PagerDuty, email, etc.)
  }

  /**
   * Record performance alert
   */
  private async recordPerformanceAlert(
    operation: string, 
    duration: number, 
    threshold: number, 
    logEntry: any
  ): Promise<void> {
    const severity = duration > threshold * 2 ? 'critical' : 'high';
    
    const alert = {
      id: crypto.randomUUID(),
      type: 'performance_alert',
      operation,
      duration,
      threshold,
      severity,
      message: `Performance degradation detected: ${operation} took ${duration}ms (threshold: ${threshold}ms)`,
      logEntry: {
        timestamp: logEntry.timestamp,
        context: logEntry.context
      },
      triggeredAt: new Date().toISOString()
    };

    console.log(JSON.stringify(alert));
  }

  /**
   * Record error for tracking
   */
  private async recordError(logEntry: any): Promise<void> {
    const errorRecord = {
      id: crypto.randomUUID(),
      type: 'error_recorded',
      error: {
        name: logEntry.error?.name,
        message: logEntry.error?.message,
        stack: logEntry.error?.stack,
        category: logEntry.context?.errorCategory
      },
      context: {
        functionName: logEntry.context?.functionName,
        requestId: logEntry.context?.requestId,
        correlationId: logEntry.context?.correlationId,
        timestamp: logEntry.timestamp
      },
      recordedAt: new Date().toISOString()
    };

    console.log(JSON.stringify(errorRecord));
  }

  /**
   * Get performance metrics summary
   */
  async getPerformanceSummary(timeRange?: { start: Date; end: Date }): Promise<any> {
    // This would query your log storage system
    // For now, return a mock summary
    return {
      totalRequests: 0,
      averageResponseTime: 0,
      errorRate: 0,
      slowOperations: [],
      timeRange: timeRange || { start: new Date(Date.now() - 3600000), end: new Date() }
    };
  }

  /**
   * Get error summary
   */
  async getErrorSummary(timeRange?: { start: Date; end: Date }): Promise<any> {
    // This would query your log storage system
    return {
      totalErrors: 0,
      errorCategories: {},
      topErrors: [],
      timeRange: timeRange || { start: new Date(Date.now() - 3600000), end: new Date() }
    };
  }
}

// Default configuration
export const defaultLogAggregationConfig: LogAggregationConfig = {
  enableRealTimeAlerts: true,
  enablePerformanceMonitoring: true,
  enableErrorTracking: true,
  logRetentionDays: 30,
  alertRules: [
    {
      id: 'high_error_rate',
      name: 'High Error Rate',
      condition: {
        field: 'level',
        operator: 'equals',
        value: 'error'
      },
      threshold: 10,
      timeWindow: 5,
      severity: 'high',
      enabled: true
    },
    {
      id: 'slow_function_execution',
      name: 'Slow Function Execution',
      condition: {
        field: 'context.duration_ms',
        operator: 'greater_than',
        value: 10000
      },
      severity: 'medium',
      enabled: true
    },
    {
      id: 'database_errors',
      name: 'Database Errors',
      condition: {
        field: 'context.errorCategory',
        operator: 'equals',
        value: 'database'
      },
      severity: 'critical',
      enabled: true
    },
    {
      id: 'memory_usage_high',
      name: 'High Memory Usage',
      condition: {
        field: 'memoryUsage.heapUsed',
        operator: 'greater_than',
        value: 100 * 1024 * 1024 // 100MB
      },
      severity: 'medium',
      enabled: true
    }
  ]
};

// Global log aggregator instance
export const logAggregator = new LogAggregator(defaultLogAggregationConfig);
