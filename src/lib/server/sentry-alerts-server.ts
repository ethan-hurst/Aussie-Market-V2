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
  // Check MEMORY_THRESHOLD_BYTES first (preferred)
  if (env.MEMORY_THRESHOLD_BYTES) {
    const threshold = parseInt(env.MEMORY_THRESHOLD_BYTES, 10);
    if (!isNaN(threshold)) {
      return threshold;
    }
  }
  
  // Check MEMORY_THRESHOLD_MB as fallback
  if (env.MEMORY_THRESHOLD_MB) {
    const threshold = parseInt(env.MEMORY_THRESHOLD_MB, 10);
    if (!isNaN(threshold)) {
      return threshold * 1024 * 1024; // Convert MB to bytes
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
    case 'webhook':
      // Handle console webhook specially
      if (channel.config.url && channel.config.url.toLowerCase().trim().startsWith('console://')) {
        console.log(`🚨 ALERT [${alert.severity.toUpperCase()}] ${alert.title}: ${alert.message}`);
      } else {
        // Generic webhook handler
        await sendWebhookAlert(channel.config, alert);
      }
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
 * Send generic webhook alert (server-only)
 */
async function sendWebhookAlert(config: any, alert: Alert): Promise<void> {
  if (!config.url) {
    console.warn('Webhook URL not configured');
    return;
  }

  // Validate webhook URL
  try {
    const url = new URL(config.url);
    if (!['http:', 'https:'].includes(url.protocol)) {
      console.warn(`Invalid webhook URL protocol: ${url.protocol}. Only http and https are allowed.`);
      return;
    }
  } catch (error) {
    console.warn(`Invalid webhook URL format: ${config.url}`, error);
    return;
  }

  const payload = {
    alert: {
      id: alert.id,
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      source: alert.source,
      metadata: alert.metadata,
      triggeredAt: alert.triggeredAt,
      status: alert.status
    },
    timestamp: new Date().toISOString()
  };

  try {
    const response = await fetch(config.url, {
      method: config.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...config.headers
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => 'Unable to read response body');
      throw new Error(`Webhook failed: ${response.status} ${response.statusText}. Response: ${responseText}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Webhook network error: ${error.message}`);
    } else {
      throw new Error(`Webhook unknown error: ${String(error)}`);
    }
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

  // Validate webhook URL
  try {
    const url = new URL(config.webhook_url);
    if (!['http:', 'https:'].includes(url.protocol)) {
      console.warn(`Invalid Slack webhook URL protocol: ${url.protocol}. Only http and https are allowed.`);
      return;
    }
  } catch (error) {
    console.warn(`Invalid Slack webhook URL format: ${config.webhook_url}`, error);
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

  try {
    const response = await fetch(config.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => 'Unable to read response body');
      throw new Error(`Slack webhook failed: ${response.status} ${response.statusText}. Response: ${responseText}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Slack webhook network error: ${error.message}`);
    } else {
      throw new Error(`Slack webhook unknown error: ${String(error)}`);
    }
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
 * Send email alert using configured email service
 */
async function sendEmailAlert(config: EmailChannelConfig, alert: SentryAlert): Promise<void> {
  // Check if email service is configured
  const emailServiceUrl = process.env.EMAIL_SERVICE_URL;
  const emailServiceKey = process.env.EMAIL_SERVICE_KEY;
  
  if (!emailServiceUrl || !emailServiceKey) {
    throw new Error('Email service not configured. Set EMAIL_SERVICE_URL and EMAIL_SERVICE_KEY environment variables.');
  }

  // Construct email payload
  const emailPayload = {
    to: config.recipients,
    from: config.from,
    subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: ${getSeverityColorForEmail(alert.severity)}; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">🚨 ${alert.severity.toUpperCase()} ALERT</h1>
        </div>
        <div style="padding: 20px; background-color: #f9f9f9;">
          <h2 style="color: #333; margin-top: 0;">${alert.title}</h2>
          <p style="color: #666; font-size: 16px; line-height: 1.5;">${alert.message}</p>
          
          <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="color: #333; margin-top: 0;">Alert Details</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Severity:</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">${alert.severity.toUpperCase()}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Source:</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">${alert.source.functionName}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Time:</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">${new Date(alert.triggeredAt).toLocaleString()}</td>
              </tr>
            </table>
          </div>
          
          ${alert.context ? `
            <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h3 style="color: #333; margin-top: 0;">Context</h3>
              <pre style="background-color: #f5f5f5; padding: 10px; border-radius: 3px; overflow-x: auto; font-size: 12px;">${JSON.stringify(alert.context, null, 2)}</pre>
            </div>
          ` : ''}
        </div>
        <div style="background-color: #333; color: white; padding: 15px; text-align: center; font-size: 12px;">
          Sent by Sentry Alerts System
        </div>
      </div>
    `,
    text: `
${alert.severity.toUpperCase()} ALERT: ${alert.title}

${alert.message}

Alert Details:
- Severity: ${alert.severity.toUpperCase()}
- Source: ${alert.source.functionName}
- Time: ${new Date(alert.triggeredAt).toLocaleString()}

${alert.context ? `Context:\n${JSON.stringify(alert.context, null, 2)}` : ''}

---
Sent by Sentry Alerts System
    `.trim()
  };

  // Send email via configured service
  const response = await fetch(emailServiceUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${emailServiceKey}`
    },
    body: JSON.stringify(emailPayload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Email service returned ${response.status}: ${errorText}`);
  }

  console.log(`Email alert sent successfully to ${config.recipients.join(', ')}`);
}

/**
 * Get severity color for email HTML
 */
function getSeverityColorForEmail(severity: string): string {
  switch (severity) {
    case 'critical': return '#dc3545'; // Red
    case 'high': return '#fd7e14'; // Orange
    case 'medium': return '#ffc107'; // Yellow
    case 'low': return '#28a745'; // Green
    default: return '#6c757d'; // Gray
  }
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
