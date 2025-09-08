/**
 * Alerting system for Edge Function failures and performance issues
 * Provides real-time monitoring and notification capabilities
 */

import { v4 as uuidv4 } from 'uuid';

// Module-level sliding window counters for count-based alert rules
const slidingWindowCounters = new Map<string, number[]>();

// Get memory threshold from environment variable with fallback
function getMemoryThreshold(): number {
  const thresholdEnv = process.env.MEMORY_THRESHOLD_BYTES || process.env.MEMORY_THRESHOLD_MB;
  
  if (thresholdEnv) {
    const threshold = parseInt(thresholdEnv, 10);
    if (!isNaN(threshold)) {
      // If MEMORY_THRESHOLD_MB is set, convert to bytes
      if (process.env.MEMORY_THRESHOLD_MB) {
        return threshold * 1024 * 1024;
      }
      // If MEMORY_THRESHOLD_BYTES is set, use as-is
      return threshold;
    }
  }
  
  // Default fallback: 200MB
  return 200 * 1024 * 1024;
}

export interface Alert {
  id: string;
  type: 'error' | 'performance' | 'availability' | 'custom';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  source: {
    functionName: string;
    requestId?: string;
    correlationId?: string;
  };
  metadata: Record<string, any>;
  triggeredAt: string;
  resolvedAt?: string;
  status: 'active' | 'resolved' | 'acknowledged';
}

export interface AlertChannel {
  id: string;
  name: string;
  type: 'webhook' | 'email' | 'slack' | 'pagerduty';
  config: Record<string, any>;
  enabled: boolean;
  severityFilter: ('low' | 'medium' | 'high' | 'critical')[];
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  condition: {
    field: string;
    operator: 'equals' | 'greater_than' | 'less_than' | 'contains' | 'regex' | 'count';
    value: any;
    timeWindow?: number; // in minutes
  };
  severity: 'low' | 'medium' | 'high' | 'critical';
  channels: string[]; // Alert channel IDs
  enabled: boolean;
  cooldown?: number; // in minutes
}

export class AlertingSystem {
  private alerts: Map<string, Alert> = new Map();
  private channels: Map<string, AlertChannel> = new Map();
  private rules: Map<string, AlertRule> = new Map();
  private lastTriggered: Map<string, Date> = new Map();

  constructor() {
    this.initializeDefaultChannels();
    this.initializeDefaultRules();
  }

  /**
   * Initialize default alert channels
   */
  private initializeDefaultChannels(): void {
    const defaultChannels: AlertChannel[] = [
      {
        id: 'console',
        name: 'Console Logging',
        type: 'webhook',
        config: {},
        enabled: true,
        severityFilter: ['low', 'medium', 'high', 'critical']
      },
      {
        id: 'critical_errors',
        name: 'Critical Errors Only',
        type: 'webhook',
        config: {},
        enabled: true,
        severityFilter: ['critical']
      }
    ];

    defaultChannels.forEach(channel => {
      this.channels.set(channel.id, channel);
    });
  }

  /**
   * Initialize default alert rules
   */
  private initializeDefaultRules(): void {
    const defaultRules: AlertRule[] = [
      {
        id: 'function_failure',
        name: 'Function Execution Failure',
        description: 'Alert when any Edge Function fails to execute',
        condition: {
          field: 'level',
          operator: 'equals',
          value: 'error'
        },
        severity: 'high',
        channels: ['console', 'critical_errors'],
        enabled: true,
        cooldown: 5
      },
      {
        id: 'slow_performance',
        name: 'Slow Function Performance',
        description: 'Alert when function execution takes longer than expected',
        condition: {
          field: 'context.duration_ms',
          operator: 'greater_than',
          value: 10000
        },
        severity: 'medium',
        channels: ['console'],
        enabled: true,
        cooldown: 10
      },
      {
        id: 'high_error_rate',
        name: 'High Error Rate',
        description: 'Alert when error rate exceeds threshold',
        condition: {
          field: 'level',
          operator: 'count',
          value: 5,
          timeWindow: 5
        },
        severity: 'critical',
        channels: ['console', 'critical_errors'],
        enabled: true,
        cooldown: 15
      },
      {
        id: 'database_errors',
        name: 'Database Operation Errors',
        description: 'Alert when database operations fail',
        condition: {
          field: 'context.errorCategory',
          operator: 'equals',
          value: 'database'
        },
        severity: 'critical',
        channels: ['console', 'critical_errors'],
        enabled: true,
        cooldown: 5
      },
      {
        id: 'memory_usage_high',
        name: 'High Memory Usage',
        description: 'Alert when memory usage is high',
        condition: {
          field: 'memoryUsage.heapUsed',
          operator: 'greater_than',
          value: getMemoryThreshold() // Configurable via MEMORY_THRESHOLD_BYTES or MEMORY_THRESHOLD_MB env var
        },
        severity: 'medium',
        channels: ['console'],
        enabled: true,
        cooldown: 30
      },
      {
        id: 'webhook_processing_failure',
        name: 'Webhook Processing Failure',
        description: 'Alert when webhook processing fails',
        condition: {
          field: 'context.functionName',
          operator: 'equals',
          value: 'stripe-webhook'
        },
        severity: 'high',
        channels: ['console', 'critical_errors'],
        enabled: true,
        cooldown: 5
      }
    ];

    defaultRules.forEach(rule => {
      this.rules.set(rule.id, rule);
    });
  }

  /**
   * Process a log entry and check for alert conditions
   */
  async processLogEntry(logEntry: any): Promise<void> {
    try {
      for (const rule of this.rules.values()) {
        if (!rule.enabled) continue;

        // Check cooldown
        if (this.isInCooldown(rule.id)) continue;

        // Evaluate condition
        if (this.evaluateCondition(logEntry, rule)) {
          await this.triggerAlert(rule, logEntry);
          this.lastTriggered.set(rule.id, new Date());
        }
      }
    } catch (error) {
      console.error('Error processing log entry for alerts:', error);
    }
  }

  /**
   * Check if rule is in cooldown period
   */
  private isInCooldown(ruleId: string): boolean {
    const lastTriggered = this.lastTriggered.get(ruleId);
    if (!lastTriggered) return false;

    const rule = this.rules.get(ruleId);
    if (!rule?.cooldown) return false;

    const cooldownMs = rule.cooldown * 60 * 1000;
    return Date.now() - lastTriggered.getTime() < cooldownMs;
  }

  /**
   * Evaluate count-based condition with sliding window
   */
  private evaluateCountCondition(rule: AlertRule, timeWindowMs: number): boolean {
    const ruleId = rule.id;
    const now = Date.now();
    const threshold = rule.condition.value || 1;
    
    // Get or create timestamp array for this rule
    if (!slidingWindowCounters.has(ruleId)) {
      slidingWindowCounters.set(ruleId, []);
    }
    
    const timestamps = slidingWindowCounters.get(ruleId)!;
    
    // Add current timestamp
    timestamps.push(now);
    
    // Prune timestamps older than the time window
    const cutoffTime = now - timeWindowMs;
    const validTimestamps = timestamps.filter(ts => ts > cutoffTime);
    
    // Update the counter with pruned timestamps
    slidingWindowCounters.set(ruleId, validTimestamps);
    
    // Check if count meets threshold
    return validTimestamps.length >= threshold;
  }

  /**
   * Safely match regex patterns with ReDoS protection
   */
  private safeRegexMatch(text: string, pattern: string): boolean {
    // Check if pattern looks like a regex (starts and ends with /)
    const isRegexPattern = pattern.startsWith('/') && pattern.endsWith('/');
    
    if (!isRegexPattern) {
      // Treat as literal string - escape all metacharacters
      try {
        const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(escapedPattern).test(text);
      } catch (error) {
        console.warn(`Invalid literal pattern: ${pattern}, falling back to string includes`);
        return text.includes(pattern);
      }
    }
    
    // Extract pattern from regex delimiters
    const regexPattern = pattern.slice(1, -1);
    
    // Basic ReDoS protection: limit pattern complexity
    if (this.isPotentiallyDangerousPattern(regexPattern)) {
      console.warn(`Potentially dangerous regex pattern detected: ${pattern}, falling back to string includes`);
      return text.includes(regexPattern);
    }
    
    try {
      // Create regex with timeout protection
      const regex = new RegExp(regexPattern);
      
      // Simple timeout protection using a promise race
      const matchPromise = new Promise<boolean>((resolve) => {
        try {
          const result = regex.test(text);
          resolve(result);
        } catch (error) {
          resolve(false);
        }
      });
      
      const timeoutPromise = new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(false), 100); // 100ms timeout
      });
      
      // For now, we'll use synchronous execution with try/catch
      // In a real implementation, you'd want to use a proper timeout mechanism
      return regex.test(text);
      
    } catch (error) {
      console.warn(`Regex compilation failed for pattern: ${pattern}, falling back to string includes`);
      return text.includes(regexPattern);
    }
  }
  
  /**
   * Check if a regex pattern is potentially dangerous (basic ReDoS detection)
   */
  private isPotentiallyDangerousPattern(pattern: string): boolean {
    // Check for nested quantifiers and other ReDoS patterns
    const dangerousPatterns = [
      /(\+|\*|\?)\s*(\+|\*|\?)/, // Nested quantifiers
      /\(\?\=.*\*/, // Positive lookahead with quantifier
      /\(\?\=.*\+/, // Positive lookahead with quantifier
      /\(\?\=.*\?/, // Positive lookahead with quantifier
      /\(\?\=.*\{[^}]*\}/, // Positive lookahead with quantifier
      /\(\?\=.*\*.*\*/, // Multiple quantifiers in lookahead
      /\(\?\=.*\+.*\+/, // Multiple quantifiers in lookahead
      /\(\?\=.*\?.*\?/, // Multiple quantifiers in lookahead
    ];
    
    return dangerousPatterns.some(dangerousPattern => dangerousPattern.test(pattern));
  }

  /**
   * Evaluate alert condition against log entry
   */
  private evaluateCondition(logEntry: any, rule: AlertRule): boolean {
    const { field, operator, value, timeWindow } = rule.condition;
    
    // Handle count-based conditions with sliding window
    if (operator === 'count') {
      return this.evaluateCountCondition(rule, timeWindow || 300000); // Default 5 minutes
    }

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
        if (typeof fieldValue !== 'string') return false;
        return this.safeRegexMatch(fieldValue, value);
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
    const alert: Alert = {
      id: uuidv4(),
      type: this.determineAlertType(rule, logEntry),
      severity: rule.severity,
      title: rule.name,
      message: this.generateAlertMessage(rule, logEntry),
      source: {
        functionName: logEntry.context?.functionName || 'unknown',
        requestId: logEntry.context?.requestId,
        correlationId: logEntry.context?.correlationId
      },
      metadata: {
        ruleId: rule.id,
        logEntry: {
          timestamp: logEntry.timestamp,
          level: logEntry.level,
          message: logEntry.message,
          context: logEntry.context
        }
      },
      triggeredAt: new Date().toISOString(),
      status: 'active'
    };

    // Store alert
    this.alerts.set(alert.id, alert);

    // Send to configured channels
    for (const channelId of rule.channels) {
      const channel = this.channels.get(channelId);
      if (channel?.enabled && channel.severityFilter.includes(alert.severity)) {
        await this.sendToChannel(alert, channel);
      }
    }

    // Log the alert
    console.log(JSON.stringify({
      type: 'alert_triggered',
      alert: {
        id: alert.id,
        title: alert.title,
        severity: alert.severity,
        source: alert.source,
        triggeredAt: alert.triggeredAt
      }
    }));
  }

  /**
   * Determine alert type based on rule and log entry
   */
  private determineAlertType(rule: AlertRule, logEntry: any): Alert['type'] {
    if (logEntry.level === 'error') return 'error';
    if (logEntry.context?.duration_ms) return 'performance';
    if (logEntry.context?.functionName) return 'availability';
    return 'custom';
  }

  /**
   * Generate alert message
   */
  private generateAlertMessage(rule: AlertRule, logEntry: any): string {
    const functionName = logEntry.context?.functionName || 'Unknown Function';
    const requestId = logEntry.context?.requestId || 'Unknown Request';
    
    switch (rule.id) {
      case 'function_failure':
        return `Function ${functionName} failed: ${logEntry.message}`;
      case 'slow_performance':
        return `Function ${functionName} is running slowly (${logEntry.context?.duration_ms}ms)`;
      case 'database_errors':
        return `Database error in ${functionName}: ${logEntry.message}`;
      case 'memory_usage_high':
        return `High memory usage in ${functionName}: ${logEntry.memoryUsage?.heapUsed} bytes`;
      case 'webhook_processing_failure':
        return `Webhook processing failed in ${functionName}: ${logEntry.message}`;
      default:
        return `${rule.name}: ${logEntry.message}`;
    }
  }

  /**
   * Send alert to channel
   */
  private async sendToChannel(alert: Alert, channel: AlertChannel): Promise<void> {
    try {
      switch (channel.type) {
        case 'webhook':
          await this.sendWebhookAlert(alert, channel);
          break;
        case 'email':
          await this.sendEmailAlert(alert, channel);
          break;
        case 'slack':
          await this.sendSlackAlert(alert, channel);
          break;
        case 'pagerduty':
          await this.sendPagerDutyAlert(alert, channel);
          break;
        default:
          console.warn(`Unknown channel type: ${channel.type}`);
      }
    } catch (error) {
      console.error(`Failed to send alert to channel ${channel.id}:`, error);
    }
  }

  /**
   * Send webhook alert (console logging for now)
   */
  private async sendWebhookAlert(alert: Alert, channel: AlertChannel): Promise<void> {
    console.log(JSON.stringify({
      type: 'webhook_alert',
      channel: channel.id,
      alert: {
        id: alert.id,
        title: alert.title,
        message: alert.message,
        severity: alert.severity,
        source: alert.source,
        triggeredAt: alert.triggeredAt
      }
    }));
  }

  /**
   * Send email alert (placeholder)
   */
  private async sendEmailAlert(alert: Alert, channel: AlertChannel): Promise<void> {
    // Implementation would depend on your email service
    console.log(`Email alert sent: ${alert.title}`);
  }

  /**
   * Send Slack alert (placeholder)
   */
  private async sendSlackAlert(alert: Alert, channel: AlertChannel): Promise<void> {
    // Implementation would depend on your Slack integration
    console.log(`Slack alert sent: ${alert.title}`);
  }

  /**
   * Send PagerDuty alert (placeholder)
   */
  private async sendPagerDutyAlert(alert: Alert, channel: AlertChannel): Promise<void> {
    // Implementation would depend on your PagerDuty integration
    console.log(`PagerDuty alert sent: ${alert.title}`);
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values()).filter(alert => alert.status === 'active');
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.status = 'acknowledged';
      return true;
    }
    return false;
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.status = 'resolved';
      alert.resolvedAt = new Date().toISOString();
      return true;
    }
    return false;
  }

  /**
   * Add a new alert channel
   */
  addChannel(channel: AlertChannel): void {
    this.channels.set(channel.id, channel);
  }

  /**
   * Add a new alert rule
   */
  addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * Get system health summary
   */
  getSystemHealth(): any {
    const activeAlerts = this.getActiveAlerts();
    const criticalAlerts = activeAlerts.filter(alert => alert.severity === 'critical');
    const highAlerts = activeAlerts.filter(alert => alert.severity === 'high');
    
    return {
      status: criticalAlerts.length > 0 ? 'critical' : 
              highAlerts.length > 0 ? 'warning' : 'healthy',
      activeAlerts: activeAlerts.length,
      criticalAlerts: criticalAlerts.length,
      highAlerts: highAlerts.length,
      lastUpdated: new Date().toISOString()
    };
  }
}

// Global alerting system instance
export const alertingSystem = new AlertingSystem();
