/**
 * Sentry alerting configuration and management
 * Defines alert rules and notification channels for different error types
 */

import { captureMessage, captureException } from '$lib/sentry';

export interface AlertRule {
  name: string;
  condition: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  channels: string[];
  cooldown: number; // minutes
  enabled: boolean;
}

export interface AlertChannel {
  name: string;
  type: 'webhook' | 'email' | 'slack' | 'pagerduty';
  config: Record<string, any>;
  enabled: boolean;
}

export class SentryAlerts {
  private static alertRules: AlertRule[] = [
    // Critical alerts
    {
      name: 'Critical API Errors',
      condition: 'error.status_code >= 500 AND error.frequency > 10',
      severity: 'critical',
      channels: ['slack', 'pagerduty'],
      cooldown: 5,
      enabled: true
    },
    {
      name: 'Database Connection Failures',
      condition: 'error.type = "database_error" AND error.frequency > 5',
      severity: 'critical',
      channels: ['slack', 'pagerduty'],
      cooldown: 10,
      enabled: true
    },
    {
      name: 'Stripe Webhook Failures',
      condition: 'error.type = "stripe_error" AND error.frequency > 3',
      severity: 'critical',
      channels: ['slack', 'pagerduty'],
      cooldown: 15,
      enabled: true
    },
    {
      name: 'High Memory Usage',
      condition: 'performance.memory_usage > 500MB',
      severity: 'critical',
      channels: ['slack'],
      cooldown: 30,
      enabled: true
    },

    // High severity alerts
    {
      name: 'Authentication Failures',
      condition: 'error.type = "authentication_error" AND error.frequency > 20',
      severity: 'high',
      channels: ['slack'],
      cooldown: 15,
      enabled: true
    },
    {
      name: 'Rate Limiting Exceeded',
      condition: 'error.type = "rate_limit" AND error.frequency > 50',
      severity: 'high',
      channels: ['slack'],
      cooldown: 30,
      enabled: true
    },
    {
      name: 'Slow API Responses',
      condition: 'performance.duration > 5000ms AND performance.frequency > 10',
      severity: 'high',
      channels: ['slack'],
      cooldown: 60,
      enabled: true
    },
    {
      name: 'File Upload Failures',
      condition: 'error.type = "file_upload_error" AND error.frequency > 10',
      severity: 'high',
      channels: ['slack'],
      cooldown: 30,
      enabled: true
    },

    // Medium severity alerts
    {
      name: 'Validation Errors',
      condition: 'error.type = "validation_error" AND error.frequency > 100',
      severity: 'medium',
      channels: ['slack'],
      cooldown: 60,
      enabled: true
    },
    {
      name: 'Edge Function Timeouts',
      condition: 'error.type = "edge_function_timeout" AND error.frequency > 5',
      severity: 'medium',
      channels: ['slack'],
      cooldown: 30,
      enabled: true
    },
    {
      name: 'Payment Processing Delays',
      condition: 'performance.operation = "stripe" AND performance.duration > 3000ms',
      severity: 'medium',
      channels: ['slack'],
      cooldown: 120,
      enabled: true
    },

    // Low severity alerts
    {
      name: 'Deprecated API Usage',
      condition: 'error.type = "deprecated_api"',
      severity: 'low',
      channels: ['slack'],
      cooldown: 1440, // 24 hours
      enabled: true
    },
    {
      name: 'Performance Degradation',
      condition: 'performance.duration > 2000ms AND performance.frequency > 20',
      severity: 'low',
      channels: ['slack'],
      cooldown: 180, // 3 hours
      enabled: true
    }
  ];

  private static alertChannels: AlertChannel[] = [
    {
      name: 'slack',
      type: 'slack',
      config: {
        webhook_url: process.env.SLACK_WEBHOOK_URL,
        channel: '#alerts',
        username: 'Sentry Alerts',
        icon_emoji: ':warning:'
      },
      enabled: true
    },
    {
      name: 'pagerduty',
      type: 'pagerduty',
      config: {
        integration_key: process.env.PAGERDUTY_INTEGRATION_KEY,
        severity_map: {
          critical: 'critical',
          high: 'error',
          medium: 'warning',
          low: 'info'
        }
      },
      enabled: true
    },
    {
      name: 'email',
      type: 'email',
      config: {
        recipients: process.env.ALERT_EMAIL_RECIPIENTS?.split(',') || [],
        from: process.env.ALERT_EMAIL_FROM || 'alerts@aussie-market.com'
      },
      enabled: false // Disabled by default
    }
  ];

  /**
   * Send alert based on error type and severity
   */
  static async sendAlert(
    type: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    message: string,
    context?: Record<string, any>
  ): Promise<void> {
    const alertRule = this.alertRules.find(rule => 
      rule.enabled && 
      rule.severity === severity && 
      rule.condition.includes(type)
    );

    if (!alertRule) {
      return;
    }

    // Check cooldown (simplified - in production, use Redis or database)
    const cooldownKey = `${alertRule.name}_${Date.now()}`;
    // TODO: Implement proper cooldown logic with persistent storage

    // Send to Sentry
    if (severity === 'critical' || severity === 'high') {
      captureException(new Error(message), {
        tags: {
          alert_type: type,
          severity,
          alert_rule: alertRule.name
        },
        extra: context
      });
    } else {
      captureMessage(message, severity === 'medium' ? 'warning' : 'info', {
        tags: {
          alert_type: type,
          severity,
          alert_rule: alertRule.name
        },
        extra: context
      });
    }

    // Send to configured channels
    for (const channelName of alertRule.channels) {
      const channel = this.alertChannels.find(c => c.name === channelName && c.enabled);
      if (channel) {
        await this.sendToChannel(channel, severity, message, context);
      }
    }
  }

  /**
   * Send alert to specific channel
   */
  private static async sendToChannel(
    channel: AlertChannel,
    severity: string,
    message: string,
    context?: Record<string, any>
  ): Promise<void> {
    try {
      switch (channel.type) {
        case 'slack':
          await this.sendSlackAlert(channel, severity, message, context);
          break;
        case 'pagerduty':
          await this.sendPagerDutyAlert(channel, severity, message, context);
          break;
        case 'email':
          await this.sendEmailAlert(channel, severity, message, context);
          break;
        case 'webhook':
          await this.sendWebhookAlert(channel, severity, message, context);
          break;
      }
    } catch (error) {
      console.error(`Failed to send alert to ${channel.name}:`, error);
    }
  }

  /**
   * Send Slack alert
   */
  private static async sendSlackAlert(
    channel: AlertChannel,
    severity: string,
    message: string,
    context?: Record<string, any>
  ): Promise<void> {
    const webhookUrl = channel.config.webhook_url;
    if (!webhookUrl) {
      console.warn('Slack webhook URL not configured');
      return;
    }

    const color = this.getSeverityColor(severity);
    const emoji = this.getSeverityEmoji(severity);

    const payload = {
      channel: channel.config.channel || '#alerts',
      username: channel.config.username || 'Sentry Alerts',
      icon_emoji: channel.config.icon_emoji || ':warning:',
      attachments: [
        {
          color,
          title: `${emoji} ${severity.toUpperCase()} Alert`,
          text: message,
          fields: context ? Object.entries(context).map(([key, value]) => ({
            title: key,
            value: String(value),
            short: true
          })) : [],
          timestamp: Math.floor(Date.now() / 1000)
        }
      ]
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Slack webhook failed: ${response.statusText}`);
    }
  }

  /**
   * Send PagerDuty alert
   */
  private static async sendPagerDutyAlert(
    channel: AlertChannel,
    severity: string,
    message: string,
    context?: Record<string, any>
  ): Promise<void> {
    const integrationKey = channel.config.integration_key;
    if (!integrationKey) {
      console.warn('PagerDuty integration key not configured');
      return;
    }

    const severityMap = channel.config.severity_map || {};
    const pagerDutySeverity = severityMap[severity] || 'warning';

    const payload = {
      routing_key: integrationKey,
      event_action: 'trigger',
      dedup_key: `sentry-${Date.now()}`,
      payload: {
        summary: message,
        severity: pagerDutySeverity,
        source: 'Sentry',
        custom_details: context || {}
      }
    };

    const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`PagerDuty webhook failed: ${response.statusText}`);
    }
  }

  /**
   * Send email alert
   */
  private static async sendEmailAlert(
    channel: AlertChannel,
    severity: string,
    message: string,
    context?: Record<string, any>
  ): Promise<void> {
    // TODO: Implement email sending (using SendGrid, AWS SES, etc.)
    console.log('Email alert would be sent:', { severity, message, context });
  }

  /**
   * Send webhook alert
   */
  private static async sendWebhookAlert(
    channel: AlertChannel,
    severity: string,
    message: string,
    context?: Record<string, any>
  ): Promise<void> {
    const webhookUrl = channel.config.webhook_url;
    if (!webhookUrl) {
      console.warn('Webhook URL not configured');
      return;
    }

    const payload = {
      severity,
      message,
      timestamp: new Date().toISOString(),
      context
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.statusText}`);
    }
  }

  /**
   * Get severity color for Slack
   */
  private static getSeverityColor(severity: string): string {
    switch (severity) {
      case 'critical': return 'danger';
      case 'high': return 'warning';
      case 'medium': return 'good';
      case 'low': return '#36a64f';
      default: return 'warning';
    }
  }

  /**
   * Get severity emoji
   */
  private static getSeverityEmoji(severity: string): string {
    switch (severity) {
      case 'critical': return ':rotating_light:';
      case 'high': return ':warning:';
      case 'medium': return ':exclamation:';
      case 'low': return ':information_source:';
      default: return ':warning:';
    }
  }

  /**
   * Get all alert rules
   */
  static getAlertRules(): AlertRule[] {
    return this.alertRules;
  }

  /**
   * Get all alert channels
   */
  static getAlertChannels(): AlertChannel[] {
    return this.alertChannels;
  }

  /**
   * Add custom alert rule
   */
  static addAlertRule(rule: AlertRule): void {
    this.alertRules.push(rule);
  }

  /**
   * Add custom alert channel
   */
  static addAlertChannel(channel: AlertChannel): void {
    this.alertChannels.push(channel);
  }
}

// Convenience functions for common alerts
export async function sendCriticalAlert(message: string, context?: Record<string, any>): Promise<void> {
  return SentryAlerts.sendAlert('critical', 'critical', message, context);
}

export async function sendHighAlert(message: string, context?: Record<string, any>): Promise<void> {
  return SentryAlerts.sendAlert('high', 'high', message, context);
}

export async function sendMediumAlert(message: string, context?: Record<string, any>): Promise<void> {
  return SentryAlerts.sendAlert('medium', 'medium', message, context);
}

export async function sendLowAlert(message: string, context?: Record<string, any>): Promise<void> {
  return SentryAlerts.sendAlert('low', 'low', message, context);
}
