type SchedulingEventType = 
  | 'override_created'
  | 'override_removed'
  | 'at_risk_job_detected'
  | 'at_risk_job_resolved'
  | 'assignment_created'
  | 'assignment_deleted'
  | 'assignment_modified'
  | 'reservation_created'
  | 'reservation_deleted'
  | 'reservation_modified'
  | 'job_status_changed'
  | 'deposit_received'
  | 'payment_disputed'
  | 'start_job_blocked';

interface SchedulingEvent {
  type: SchedulingEventType;
  timestamp: Date;
  payload: Record<string, unknown>;
}

type EventListener = (event: SchedulingEvent) => void;

class SchedulingAnalytics {
  private listeners: Set<EventListener> = new Set();
  private eventLog: SchedulingEvent[] = [];
  private readonly MAX_LOG_SIZE = 100;

  emit(type: SchedulingEventType, payload: Record<string, unknown> = {}) {
    const event: SchedulingEvent = {
      type,
      timestamp: new Date(),
      payload,
    };

    this.eventLog.push(event);
    if (this.eventLog.length > this.MAX_LOG_SIZE) {
      this.eventLog.shift();
    }

    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Analytics listener error:', error);
      }
    });

    if (import.meta.env.DEV) {
      console.log(`[Analytics] ${type}`, payload);
    }
  }

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getRecentEvents(count: number = 10): SchedulingEvent[] {
    return this.eventLog.slice(-count);
  }

  getEventsByType(type: SchedulingEventType): SchedulingEvent[] {
    return this.eventLog.filter(e => e.type === type);
  }

  clearLog() {
    this.eventLog = [];
  }
}

export const schedulingAnalytics = new SchedulingAnalytics();

export function emitOverrideCreated(details: {
  entityType: 'assignment' | 'reservation';
  entityId: string;
  reason: string;
  jobId?: string;
  crewId?: string;
  equipmentId?: string;
}) {
  schedulingAnalytics.emit('override_created', details);
}

export function emitOverrideRemoved(details: {
  entityType: 'assignment' | 'reservation';
  entityId: string;
  jobId?: string;
}) {
  schedulingAnalytics.emit('override_removed', details);
}

export function emitAtRiskJobDetected(details: {
  jobId: string;
  reason: string;
  hoursUntilScheduled?: number;
  hasDispute?: boolean;
  depositPaid?: boolean;
}) {
  schedulingAnalytics.emit('at_risk_job_detected', details);
}

export function emitAtRiskJobResolved(details: {
  jobId: string;
  resolution: 'deposit_paid' | 'dispute_resolved' | 'job_cancelled' | 'rescheduled';
}) {
  schedulingAnalytics.emit('at_risk_job_resolved', details);
}

export function emitAssignmentCreated(details: {
  assignmentId: string;
  jobId: string;
  crewId: string;
  scheduledDate: string;
}) {
  schedulingAnalytics.emit('assignment_created', details);
}

export function emitAssignmentDeleted(details: {
  assignmentId: string;
  jobId: string;
  crewId: string;
  wasOverridden: boolean;
}) {
  schedulingAnalytics.emit('assignment_deleted', details);
}

export function emitReservationCreated(details: {
  reservationId: string;
  jobId: string;
  equipmentId: string;
  scheduledDate: string;
}) {
  schedulingAnalytics.emit('reservation_created', details);
}

export function emitReservationDeleted(details: {
  reservationId: string;
  jobId: string;
  equipmentId: string;
  wasOverridden: boolean;
}) {
  schedulingAnalytics.emit('reservation_deleted', details);
}

export function emitJobStatusChanged(details: {
  jobId: string;
  previousStatus: string;
  newStatus: string;
  triggeredBy?: 'user' | 'system' | 'crew';
}) {
  schedulingAnalytics.emit('job_status_changed', details);
}

export function emitDepositReceived(details: {
  jobId: string;
  amount: number;
  wasAtRisk: boolean;
}) {
  schedulingAnalytics.emit('deposit_received', details);
}

export function emitPaymentDisputed(details: {
  invoiceId: string;
  jobId: string;
  amount: number;
}) {
  schedulingAnalytics.emit('payment_disputed', details);
}

export function emitStartJobBlocked(details: {
  jobId: string;
  reason: 'deposit_not_paid' | 'payment_disputed' | 'job_cancelled';
  crewAttempted?: string;
}) {
  schedulingAnalytics.emit('start_job_blocked', details);
}
