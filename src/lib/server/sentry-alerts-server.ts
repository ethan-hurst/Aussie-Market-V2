/**
 * Server-only Sentry Alerts Configuration
 * This module should NEVER be imported by client-side code
 */

import { env } from '$env/dynamic/private';

export interface AlertChannel {
  name: string;
  type: 'slack' | 'pagerduty' | 'email' | 'webhook';
  config: Record<string, any>;
  enabled: boolean;
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  condition: {
    field: string;
    operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'regex' | 'count';
    value: any;
    timeWindow?: number;
  };
  severity: 'low' | 'medium' | 'high' | 'critical';
  channels: string[];
  enabled: boolean;
  cooldown: number; // minutes
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

/**
 * Get alert channels configuration (server-only)
 */
export function getAlertChannels(): AlertChannel[] {
  return [
    {
      name: 'console',
      type: 'webhook',
      config: {
        url: 'console://',
        method: 'log'
      },
      enabled: true
    },
    {
      name: 'slack',
      type: 'slack',
      config: {
        webhook_url: env.SLACK_WEBHOOK_URL,
        channel: '#alerts',
        username: 'Sentry Alerts',
        icon_emoji: ':warning:'
      },
      enabled: !!env.SLACK_WEBHOOK_URL
    },
    {
      name: 'pagerduty',
      type: 'pagerduty',
      config: {
        integration_key: env.PAGERDUTY_INTEGRATION_KEY,
        severity_map: {
          critical: 'critical',
          high: 'error',
          medium: 'warning',
          low: 'info'
        }
      },
      enabled: !!env.PAGERDUTY_INTEGRATION_KEY
    },
    {
      name: 'email',
      type: 'email',
      config: {
        recipients: env.ALERT_EMAIL_RECIPIENTS?.split(',') || [],
        from: env.ALERT_EMAIL_FROM || 'alerts@aussie-market.com'
      },
      enabled: !!env.ALERT_EMAIL_RECIPIENTS
    }
  ];
}

/**
 * Get default alert rules (server-only)
 */
export function getDefaultAlertRules(): AlertRule[] {
  return [
    {
      id: 'high-error-rate',
      name: 'High Error Rate',
      description: 'Alert when error rate exceeds 5%',
      condition: {
        field: 'error_rate',
        operator: 'greater_than',
        value: 0.05
      },
      severity: 'high',
      channels: ['console', 'slack'],
      enabled: true,
      cooldown: 15
    },
    {
      id: 'slow-response-time',
      name: 'Slow Response Time',
      description: 'Alert when average response time exceeds 2 seconds',
      condition: {
        field: 'response_time',
        operator: 'greater_than',
        value: 2000
      },
      severity: 'medium',
      channels: ['console', 'slack'],
      enabled: true,
      cooldown: 30
    },
    {
      id: 'high-memory-usage',
      name: 'High Memory Usage',
      description: 'Alert when memory usage is high',
      condition: {
        field: 'memoryUsage.heapUsed',
        operator: 'greater_than',
        value: getMemoryThreshold()
      },
      severity: 'medium',
      channels: ['console'],
      enabled: true,
      cooldown: 30
    },
    {
      id: 'database-connection-failure',
      name: 'Database Connection Failure',
      description: 'Alert when database connections fail',
      condition: {
        field: 'error_type',
        operator: 'equals',
        value: 'database_connection_error'
      },
      severity: 'critical',
      channels: ['console', 'slack', 'pagerduty'],
      enabled: true,
      cooldown: 5
    },
    {
      id: 'stripe-webhook-failure',
      name: 'Stripe Webhook Failure',
      description: 'Alert when Stripe webhook processing fails',
      condition: {
        field: 'error_type',
        operator: 'equals',
        value: 'stripe_webhook_error'
      },
      severity: 'high',
      channels: ['console', 'slack'],
      enabled: true,
      cooldown: 10
    },
    {
      id: 'api-rate-limit-exceeded',
      name: 'API Rate Limit Exceeded',
      description: 'Alert when API rate limits are exceeded',
      condition: {
        field: 'error_type',
        operator: 'equals',
        value: 'rate_limit_exceeded'
      },
      severity: 'medium',
      channels: ['console'],
      enabled: true,
      cooldown: 60
    }
  ];
}

/**
 * Get memory threshold from environment variable with fallback
 */
function getMemoryThreshold(): number {
  const thresholdEnv = env.MEMORY_THRESHOLD_BYTES || env.MEMORY_THRESHOLD_MB;
  
  if (thresholdEnv) {
    const threshold = parseInt(thresholdEnv, 10);
    if (!isNaN(threshold)) {
      // If MEMORY_THRESHOLD_MB is set, convert to bytes
      if (env.MEMORY_THRESHOLD_MB) {
        return threshold * 1024 * 1024;
      }
      // If MEMORY_THRESHOLD_BYTES is set, use as-is
      return threshold;
    }
  }
  
  // Default fallback: 200MB
  return 200 * 1024 * 1024;
}

/**
 * Send alert to configured channels (server-only)
 */
export async function sendAlert(alert: Alert): Promise<void> {
  const channels = getAlertChannels();
  const enabledChannels = channels.filter(channel => channel.enabled);

  for (const channel of enabledChannels) {
    try {
      await sendToChannel(channel, alert);
    } catch (error) {
      console.error(`Failed to send alert to ${channel.name}:`, error);
    }
  }
}

/**
 * Send alert to specific channel (server-only)
 */
async function sendToChannel(channel: AlertChannel, alert: Alert): Promise<void> {
  switch (channel.type) {
    case 'console':
      console.log(`🚨 ALERT [${alert.severity.toUpperCase()}] ${alert.title}: ${alert.message}`);
      break;
      
    case 'slack':
      await sendSlackAlert(channel.config, alert);
      break;
      
    case 'pagerduty':
      await sendPagerDutyAlert(channel.config, alert);
      break;
      
    case 'email':
      await sendEmailAlert(channel.config, alert);
      break;
      
    default:
      console.warn(`Unknown alert channel type: ${channel.type}`);
  }
}

/**
 * Send Slack alert (server-only)
 */
async function sendSlackAlert(config: any, alert: Alert): Promise<void> {
  if (!config.webhook_url) {
    console.warn('Slack webhook URL not configured');
    return;
  }

  const payload = {
    channel: config.channel,
    username: config.username,
    icon_emoji: config.icon_emoji,
    attachments: [
      {
        color: getSeverityColor(alert.severity),
        title: alert.title,
        text: alert.message,
        fields: [
          {
            title: 'Severity',
            value: alert.severity.toUpperCase(),
            short: true
          },
          {
            title: 'Source',
            value: alert.source.functionName,
            short: true
          },
          {
            title: 'Time',
            value: new Date(alert.triggeredAt).toISOString(),
            short: true
          }
        ],
        footer: 'Sentry Alerts',
        ts: Math.floor(Date.now() / 1000)
      }
    ]
  };

  const response = await fetch(config.webhook_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Slack webhook failed: ${response.status} ${response.statusText}`);
  }
}

/**
 * Send PagerDuty alert (server-only)
 */
async function sendPagerDutyAlert(config: any, alert: Alert): Promise<void> {
  if (!config.integration_key) {
    console.warn('PagerDuty integration key not configured');
    return;
  }

  const payload = {
    routing_key: config.integration_key,
    event_action: 'trigger',
    dedup_key: alert.id,
    payload: {
      summary: alert.title,
      source: alert.source.functionName,
      severity: config.severity_map[alert.severity] || 'error',
      custom_details: {
        message: alert.message,
        metadata: alert.metadata,
        triggered_at: alert.triggeredAt
      }
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
    throw new Error(`PagerDuty alert failed: ${response.status} ${response.statusText}`);
  }
}

/**
 * Send email alert (server-only)
 */
async function sendEmailAlert(config: any, alert: Alert): Promise<void> {
  if (!config.recipients || config.recipients.length === 0) {
    console.warn('Email recipients not configured');
    return;
  }

  // This would integrate with your email service (SendGrid, SES, etc.)
  // For now, just log the email content
  console.log(`📧 EMAIL ALERT [${alert.severity.toUpperCase()}]`);
  console.log(`To: ${config.recipients.join(', ')}`);
  console.log(`From: ${config.from}`);
  console.log(`Subject: ${alert.title}`);
  console.log(`Body: ${alert.message}`);
}

/**
 * Get severity color for Slack
 */
function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'danger';
    case 'high': return 'warning';
    case 'medium': return 'good';
    case 'low': return '#36a64f';
    default: return '#36a64f';
  }
}
