export interface PaymentNotificationAction {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
  handler?: () => void;
}

export interface PaymentErrorInfo {
  type: 'card_error' | 'network_error' | 'webhook_error' | 'processing_error';
  code?: string;
  retryable: boolean;
  canRetry: boolean;
  requiresNewPayment: boolean;
  shouldContactSupport: boolean;
  userMessage: string;
}

export interface MetricData {
  metric_name: string;
  metric_value: number;
  metric_unit?: string;
  recorded_at: string;
}

export interface BusinessData {
  business: MetricData[];
}

export interface FinancialData {
  financial: MetricData[];
}

export interface BusinessEvent {
  event_type: string;
  metric_value: number;
  metric_unit?: string;
  recorded_at: string;
}

export interface NotificationEventData {
  notificationId: string;
  actionLabel: string;
}