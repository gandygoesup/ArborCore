import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Users, 
  Truck, 
  Clock, 
  AlertTriangle, 
  Lock,
  CheckCircle,
  CircleDashed,
  DollarSign,
  AlertCircle,
  Ban,
  Undo2,
  X,
  Trash2
} from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval, isSameDay, differenceInHours } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Crew, CrewAssignment, Equipment, EquipmentReservation, Job, Invoice } from "@shared/schema";
import { 
  emitAssignmentDeleted,
  emitReservationDeleted,
  schedulingAnalytics
} from "@/lib/analytics";

type JobDisplayStatus = 'confirmed' | 'tentative' | 'awaiting_deposit' | 'at_risk' | 'blocked';
type DepositDisplayStatus = 'paid' | 'unpaid' | 'disputed';

function getJobDisplayStatus(job: Job | undefined, invoice: Invoice | undefined): JobDisplayStatus {
  if (!job) return 'blocked';
  
  if (job.status === 'cancelled') return 'blocked';
  
  const hasDisputedInvoice = invoice?.status === 'disputed';
  if (hasDisputedInvoice) return 'at_risk';
  
  if (job.depositPaid) {
    if (job.status === 'scheduled' || job.status === 'in_progress') return 'confirmed';
    return 'tentative';
  }
  
  if (job.status === 'scheduled' || job.status === 'in_progress') return 'at_risk';
  if (job.status === 'pending') return 'awaiting_deposit';
  
  return 'tentative';
}

function getDepositDisplayStatus(job: Job | undefined, invoice: Invoice | undefined): DepositDisplayStatus {
  if (invoice?.status === 'disputed') return 'disputed';
  if (job?.depositPaid) return 'paid';
  return 'unpaid';
}

function getSchedulingBlockReason(job: Job | undefined, invoice: Invoice | undefined): string | null {
  if (!job) return 'Job not found';
  if (job.status === 'cancelled') return 'Job has been cancelled';
  if (invoice?.status === 'disputed') return 'Payment is under dispute - scheduling restricted';
  if (!job.depositPaid && (job.status === 'scheduled' || job.status === 'in_progress')) {
    return 'Deposit unpaid - job is at risk';
  }
  if (!job.depositPaid) return 'Deposit not yet received';
  return null;
}

function isJobAtRiskIn48Hours(job: Job | undefined, scheduledDate: Date | string): boolean {
  if (!job || job.depositPaid) return false;
  const schedDate = typeof scheduledDate === 'string' ? new Date(scheduledDate) : scheduledDate;
  const hoursUntil = differenceInHours(schedDate, new Date());
  return hoursUntil <= 48 && hoursUntil > 0;
}

function JobStatusChip({ status }: { status: JobDisplayStatus }) {
  const configs: Record<JobDisplayStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof CheckCircle; className: string }> = {
    confirmed: { 
      label: 'CONFIRMED', 
      variant: 'default',
      icon: CheckCircle,
      className: 'bg-green-600 dark:bg-green-700 text-white border-0'
    },
    tentative: { 
      label: 'TENTATIVE', 
      variant: 'secondary',
      icon: CircleDashed,
      className: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
    },
    awaiting_deposit: { 
      label: 'AWAITING DEPOSIT', 
      variant: 'outline',
      icon: DollarSign,
      className: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-400 dark:border-amber-600'
    },
    at_risk: { 
      label: 'AT RISK', 
      variant: 'destructive',
      icon: AlertTriangle,
      className: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 border-red-400 dark:border-red-600'
    },
    blocked: { 
      label: 'BLOCKED', 
      variant: 'destructive',
      icon: Ban,
      className: 'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-400 dark:border-gray-600'
    },
  };
  
  const config = configs[status];
  const Icon = config.icon;
  
  return (
    <Badge 
      variant={config.variant}
      className={`text-[10px] px-1.5 py-0 font-medium ${config.className}`}
      data-testid={`badge-status-${status}`}
    >
      <Icon className="h-2.5 w-2.5 mr-0.5" />
      {config.label}
    </Badge>
  );
}

function DepositBadge({ status }: { status: DepositDisplayStatus }) {
  const configs: Record<DepositDisplayStatus, { label: string; className: string; icon: typeof DollarSign }> = {
    paid: { 
      label: 'PAID', 
      className: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-400 dark:border-green-600',
      icon: CheckCircle
    },
    unpaid: { 
      label: 'UNPAID', 
      className: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-400 dark:border-amber-600',
      icon: DollarSign
    },
    disputed: { 
      label: 'DISPUTED', 
      className: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 border-red-400 dark:border-red-600',
      icon: AlertCircle
    },
  };
  
  const config = configs[status];
  const Icon = config.icon;
  
  return (
    <Badge 
      variant="outline"
      className={`text-[10px] px-1.5 py-0 font-medium ${config.className}`}
      data-testid={`badge-deposit-${status}`}
    >
      <Icon className="h-2.5 w-2.5 mr-0.5" />
      {config.label}
    </Badge>
  );
}

function LockIndicator({ reason }: { reason: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-muted cursor-help" data-testid="indicator-lock">
          <Lock className="h-3 w-3 text-muted-foreground" />
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[200px]">
        <p className="text-xs">{reason}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function TimeUrgencyBadge({ scheduledDate }: { scheduledDate: Date | string }) {
  const schedDate = typeof scheduledDate === 'string' ? new Date(scheduledDate) : scheduledDate;
  const hoursUntil = differenceInHours(schedDate, new Date());
  
  if (hoursUntil > 48 || hoursUntil <= 0) return null;
  
  return (
    <Badge 
      variant="outline"
      className="text-[10px] px-1.5 py-0 font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-400 dark:border-orange-600 animate-pulse"
      data-testid="badge-urgent-48h"
    >
      <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
      RISK IN {hoursUntil}H
    </Badge>
  );
}

type SchedulingAction = 'remove_assignment' | 'remove_reservation' | 'reschedule';

interface SchedulingConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: SchedulingAction;
  itemName: string;
  scheduledDate?: string;
  onConfirm: () => void;
  isPending?: boolean;
}

function SchedulingConfirmDialog({
  open,
  onOpenChange,
  action,
  itemName,
  scheduledDate,
  onConfirm,
  isPending = false,
}: SchedulingConfirmDialogProps) {
  const actionConfigs: Record<SchedulingAction, { title: string; description: string; confirmText: string; variant: 'destructive' | 'default' }> = {
    remove_assignment: {
      title: 'Remove Crew Assignment',
      description: `Are you sure you want to remove the crew assignment for "${itemName}"${scheduledDate ? ` on ${scheduledDate}` : ''}? This will free up the crew for other jobs.`,
      confirmText: 'Remove Assignment',
      variant: 'destructive',
    },
    remove_reservation: {
      title: 'Cancel Equipment Reservation',
      description: `Are you sure you want to cancel the equipment reservation for "${itemName}"${scheduledDate ? ` on ${scheduledDate}` : ''}? This equipment will become available for other jobs.`,
      confirmText: 'Cancel Reservation',
      variant: 'destructive',
    },
    reschedule: {
      title: 'Reschedule Job',
      description: `Move "${itemName}" to a different date? You can undo this action within 10 seconds.`,
      confirmText: 'Reschedule',
      variant: 'default',
    },
  };

  const config = actionConfigs[action];

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="dialog-scheduling-confirm">
        <AlertDialogHeader>
          <AlertDialogTitle data-testid="dialog-title">{config.title}</AlertDialogTitle>
          <AlertDialogDescription data-testid="dialog-description">
            {config.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending} data-testid="button-cancel-action">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isPending}
            className={config.variant === 'destructive' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            data-testid="button-confirm-action"
          >
            {isPending ? 'Processing...' : config.confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const UNDO_WINDOW_MS = 10000;

interface UndoState {
  id: string;
  type: 'assignment' | 'reservation';
  data: CrewAssignment | EquipmentReservation;
  action: 'delete' | 'update';
  previousData?: CrewAssignment | EquipmentReservation;
  expiresAt: number;
}

function useSchedulingUndo() {
  const { toast } = useToast();
  const [pendingUndo, setPendingUndo] = useState<UndoState | null>(null);

  const restoreAssignment = useMutation({
    mutationFn: async (data: CrewAssignment) => {
      return apiRequest('POST', '/api/crew-assignments', {
        crewId: data.crewId,
        jobId: data.jobId,
        scheduledDate: data.scheduledDate,
        startTime: data.startTime,
        endTime: data.endTime,
        isOverridden: data.isOverridden,
        overrideReason: data.overrideReason,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crew-assignments'] });
      toast({
        title: 'Restored',
        description: 'Assignment has been restored.',
      });
      setPendingUndo(null);
    },
  });

  const restoreReservation = useMutation({
    mutationFn: async (data: EquipmentReservation) => {
      return apiRequest('POST', '/api/equipment-reservations', {
        equipmentId: data.equipmentId,
        jobId: data.jobId,
        scheduledDate: data.scheduledDate,
        startTime: data.startTime,
        endTime: data.endTime,
        isOverridden: data.isOverridden,
        overrideReason: data.overrideReason,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/equipment-reservations'] });
      toast({
        title: 'Restored',
        description: 'Reservation has been restored.',
      });
      setPendingUndo(null);
    },
  });

  const showUndoToast = useCallback((undoState: UndoState, itemName: string) => {
    setPendingUndo(undoState);
    
    if (undoState.action === 'delete') {
      if (undoState.type === 'assignment') {
        const assignment = undoState.data as CrewAssignment;
        emitAssignmentDeleted({
          assignmentId: assignment.id,
          jobId: assignment.jobId,
          crewId: assignment.crewId,
          wasOverridden: assignment.isOverridden || false,
        });
      } else {
        const reservation = undoState.data as EquipmentReservation;
        emitReservationDeleted({
          reservationId: reservation.id,
          jobId: reservation.jobId,
          equipmentId: reservation.equipmentId,
          wasOverridden: reservation.isOverridden || false,
        });
      }
    }
    
    toast({
      title: undoState.action === 'delete' ? 'Removed' : 'Updated',
      description: (
        <div className="flex items-center justify-between gap-4">
          <span>{itemName} {undoState.action === 'delete' ? 'removed' : 'updated'}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (undoState.action === 'delete') {
                if (undoState.type === 'assignment') {
                  restoreAssignment.mutate(undoState.data as CrewAssignment);
                } else {
                  restoreReservation.mutate(undoState.data as EquipmentReservation);
                }
              }
            }}
            data-testid="button-undo"
          >
            <Undo2 className="h-3 w-3 mr-1" />
            Undo
          </Button>
        </div>
      ),
      duration: UNDO_WINDOW_MS,
    });
  }, [toast, restoreAssignment, restoreReservation]);

  return {
    showUndoToast,
    pendingUndo,
    isRestoring: restoreAssignment.isPending || restoreReservation.isPending,
  };
}

interface SchedulingErrorBannerProps {
  error: string | null;
  onDismiss: () => void;
}

function SchedulingErrorBanner({ error, onDismiss }: SchedulingErrorBannerProps) {
  if (!error) return null;

  return (
    <div 
      className="flex items-center justify-between gap-4 px-4 py-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-md border border-red-300 dark:border-red-700"
      data-testid="banner-scheduling-error"
    >
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        <span className="text-sm">{error}</span>
      </div>
      <Button
        size="icon"
        variant="ghost"
        onClick={onDismiss}
        className="h-6 w-6"
        data-testid="button-dismiss-error"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

function getWeekDays(date: Date) {
  const start = startOfWeek(date, { weekStartsOn: 0 });
  const end = endOfWeek(date, { weekStartsOn: 0 });
  return eachDayOfInterval({ start, end });
}

function formatTime(time: string | null): string {
  if (!time) return "";
  return time.slice(0, 5);
}

function TimeSlotBadge({ startTime, endTime }: { startTime: string | null; endTime: string | null }) {
  if (!startTime || !endTime) {
    return <Badge variant="secondary" className="text-xs">All Day</Badge>;
  }
  return (
    <Badge variant="secondary" className="text-xs font-mono">
      {formatTime(startTime)} - {formatTime(endTime)}
    </Badge>
  );
}

interface AssignmentCardProps {
  assignment: CrewAssignment;
  job?: Job;
  invoice?: Invoice;
}

function AssignmentCard({ assignment, job, invoice }: AssignmentCardProps) {
  const displayStatus = getJobDisplayStatus(job, invoice);
  const depositStatus = getDepositDisplayStatus(job, invoice);
  const blockReason = getSchedulingBlockReason(job, invoice);
  const isBlocked = displayStatus === 'blocked' || displayStatus === 'at_risk';
  const showUrgency = isJobAtRiskIn48Hours(job, assignment.scheduledDate);
  
  return (
    <div
      className={`p-2 rounded-md border text-xs space-y-1.5 ${
        isBlocked
          ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 opacity-80"
          : assignment.isOverridden 
            ? "bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700" 
            : "bg-accent/50 border-border"
      }`}
      data-testid={`card-assignment-${assignment.id}`}
    >
      <div className="flex items-center gap-1 justify-between">
        <span className="font-medium truncate flex-1" data-testid={`text-assignment-job-${assignment.id}`}>
          {job?.title || `Job #${assignment.jobId.slice(0, 8)}`}
        </span>
        {blockReason && <LockIndicator reason={blockReason} />}
      </div>
      
      <div className="flex items-center gap-1 flex-wrap">
        <JobStatusChip status={displayStatus} />
        <DepositBadge status={depositStatus} />
        {showUrgency && <TimeUrgencyBadge scheduledDate={assignment.scheduledDate} />}
      </div>
      
      <div className="flex items-center gap-1 flex-wrap">
        <TimeSlotBadge startTime={assignment.startTime} endTime={assignment.endTime} />
        {assignment.isOverridden && (
          <Badge variant="outline" className="text-orange-600 dark:text-orange-400 border-orange-400 text-[10px] px-1 py-0" data-testid={`badge-overridden-${assignment.id}`}>
            <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
            OVERRIDDEN
          </Badge>
        )}
      </div>
      
      {assignment.isOverridden && assignment.overrideReason && (
        <div className="flex items-start gap-1 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 rounded px-1.5 py-0.5" data-testid={`banner-override-reason-${assignment.id}`}>
          <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
          <span className="text-[10px] leading-tight">{assignment.overrideReason}</span>
        </div>
      )}
      
      {assignment.notes && (
        <div className="text-muted-foreground truncate">{assignment.notes}</div>
      )}
    </div>
  );
}

interface ReservationCardProps {
  reservation: EquipmentReservation;
  job?: Job;
  invoice?: Invoice;
}

function ReservationCard({ reservation, job, invoice }: ReservationCardProps) {
  const displayStatus = getJobDisplayStatus(job, invoice);
  const depositStatus = getDepositDisplayStatus(job, invoice);
  const blockReason = getSchedulingBlockReason(job, invoice);
  const isBlocked = displayStatus === 'blocked' || displayStatus === 'at_risk';
  const showUrgency = isJobAtRiskIn48Hours(job, reservation.scheduledDate);
  
  return (
    <div
      className={`p-2 rounded-md border text-xs space-y-1.5 ${
        isBlocked
          ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 opacity-80"
          : reservation.isOverridden 
            ? "bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700" 
            : "bg-accent/50 border-border"
      }`}
      data-testid={`card-reservation-${reservation.id}`}
    >
      <div className="flex items-center gap-1 justify-between">
        <span className="font-medium truncate flex-1" data-testid={`text-reservation-job-${reservation.id}`}>
          {job?.title || `Job #${reservation.jobId.slice(0, 8)}`}
        </span>
        {blockReason && <LockIndicator reason={blockReason} />}
      </div>
      
      <div className="flex items-center gap-1 flex-wrap">
        <JobStatusChip status={displayStatus} />
        <DepositBadge status={depositStatus} />
        {showUrgency && <TimeUrgencyBadge scheduledDate={reservation.scheduledDate} />}
      </div>
      
      <div className="flex items-center gap-1 flex-wrap">
        <TimeSlotBadge startTime={reservation.startTime} endTime={reservation.endTime} />
        {reservation.isOverridden && (
          <Badge variant="outline" className="text-orange-600 dark:text-orange-400 border-orange-400 text-[10px] px-1 py-0" data-testid={`badge-overridden-${reservation.id}`}>
            <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
            OVERRIDDEN
          </Badge>
        )}
      </div>
      
      {reservation.isOverridden && reservation.overrideReason && (
        <div className="flex items-start gap-1 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 rounded px-1.5 py-0.5" data-testid={`banner-override-reason-${reservation.id}`}>
          <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
          <span className="text-[10px] leading-tight">{reservation.overrideReason}</span>
        </div>
      )}
      
      {reservation.notes && (
        <div className="text-muted-foreground truncate">{reservation.notes}</div>
      )}
    </div>
  );
}

function WeekNavigation({
  currentDate,
  onPrevWeek,
  onNextWeek,
  onToday,
}: {
  currentDate: Date;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
}) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });

  return (
    <div className="flex items-center gap-1 md:gap-2">
      <Button variant="outline" size="icon" onClick={onPrevWeek} className="min-h-10 min-w-10 md:min-h-9 md:min-w-9" data-testid="button-prev-week">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="sm" onClick={onToday} className="min-h-10 md:min-h-9" data-testid="button-today">
        Today
      </Button>
      <Button variant="outline" size="icon" onClick={onNextWeek} className="min-h-10 min-w-10 md:min-h-9 md:min-w-9" data-testid="button-next-week">
        <ChevronRight className="h-4 w-4" />
      </Button>
      <span className="text-xs md:text-sm font-medium ml-1 md:ml-2 whitespace-nowrap" data-testid="text-week-range">
        <span className="hidden sm:inline">{format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}</span>
        <span className="sm:hidden">{format(weekStart, "M/d")} - {format(weekEnd, "M/d")}</span>
      </span>
    </div>
  );
}

function CrewCalendarRow({
  crew,
  weekDays,
  assignments,
  jobs,
  invoices,
}: {
  crew: Crew;
  weekDays: Date[];
  assignments: CrewAssignment[];
  jobs: Job[];
  invoices: Invoice[];
}) {
  const jobsMap = useMemo(() => {
    const map = new Map<string, Job>();
    jobs.forEach((j) => map.set(j.id, j));
    return map;
  }, [jobs]);

  const invoicesByJobId = useMemo(() => {
    const map = new Map<string, Invoice>();
    invoices.forEach((inv) => {
      if (inv.jobId && inv.invoiceType === 'deposit') {
        map.set(inv.jobId, inv);
      }
    });
    return map;
  }, [invoices]);

  const getAssignmentsForDay = (day: Date) => {
    const dayStr = format(day, "yyyy-MM-dd");
    return assignments.filter((a) => {
      const dateValue = a.scheduledDate as Date | string;
      const assignmentDateStr = typeof dateValue === "string" 
        ? dateValue.slice(0, 10)
        : format(dateValue, "yyyy-MM-dd");
      return assignmentDateStr === dayStr;
    });
  };

  return (
    <div className="grid grid-cols-8 border-b border-border" data-testid={`row-crew-${crew.id}`}>
      <div className="p-2 md:p-3 border-r border-border bg-muted/30 flex items-start gap-1 md:gap-2">
        <div
          className="w-2 md:w-3 h-2 md:h-3 rounded-full mt-0.5 flex-shrink-0"
          style={{ backgroundColor: crew.color || "#6b7280" }}
        />
        <div className="min-w-0">
          <div className="font-medium text-xs md:text-sm truncate" data-testid={`text-crew-name-${crew.id}`}>{crew.name}</div>
          {crew.description && <div className="text-[10px] md:text-xs text-muted-foreground truncate hidden md:block">{crew.description}</div>}
        </div>
      </div>
      {weekDays.map((day) => {
        const dayAssignments = getAssignmentsForDay(day);
        return (
          <div key={day.toISOString()} className="p-1 md:p-2 border-r border-border min-h-[60px] md:min-h-[80px] space-y-1">
            {dayAssignments.map((a) => (
              <AssignmentCard 
                key={a.id} 
                assignment={a} 
                job={jobsMap.get(a.jobId)} 
                invoice={invoicesByJobId.get(a.jobId)}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function EquipmentCalendarRow({
  equipmentItem,
  weekDays,
  reservations,
  jobs,
  invoices,
}: {
  equipmentItem: Equipment;
  weekDays: Date[];
  reservations: EquipmentReservation[];
  jobs: Job[];
  invoices: Invoice[];
}) {
  const jobsMap = useMemo(() => {
    const map = new Map<string, Job>();
    jobs.forEach((j) => map.set(j.id, j));
    return map;
  }, [jobs]);

  const invoicesByJobId = useMemo(() => {
    const map = new Map<string, Invoice>();
    invoices.forEach((inv) => {
      if (inv.jobId && inv.invoiceType === 'deposit') {
        map.set(inv.jobId, inv);
      }
    });
    return map;
  }, [invoices]);

  const getReservationsForDay = (day: Date) => {
    const dayStr = format(day, "yyyy-MM-dd");
    return reservations.filter((r) => {
      const dateValue = r.scheduledDate as Date | string;
      const reservationDateStr = typeof dateValue === "string" 
        ? dateValue.slice(0, 10)
        : format(dateValue, "yyyy-MM-dd");
      return reservationDateStr === dayStr;
    });
  };

  return (
    <div className="grid grid-cols-8 border-b border-border" data-testid={`row-equipment-${equipmentItem.id}`}>
      <div className="p-2 md:p-3 border-r border-border bg-muted/30">
        <div className="font-medium text-xs md:text-sm truncate" data-testid={`text-equipment-name-${equipmentItem.id}`}>
          {equipmentItem.name}
        </div>
        <div className="text-[10px] md:text-xs text-muted-foreground truncate hidden md:block">{equipmentItem.type}</div>
      </div>
      {weekDays.map((day) => {
        const dayReservations = getReservationsForDay(day);
        return (
          <div key={day.toISOString()} className="p-1 md:p-2 border-r border-border min-h-[60px] md:min-h-[80px] space-y-1">
            {dayReservations.map((r) => (
              <ReservationCard 
                key={r.id} 
                reservation={r} 
                job={jobsMap.get(r.jobId)} 
                invoice={invoicesByJobId.get(r.jobId)}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function DayHeaders({ weekDays }: { weekDays: Date[] }) {
  const today = new Date();
  return (
    <div className="grid grid-cols-8 border-b border-border bg-muted/50 sticky top-0 z-20">
      <div className="p-2 md:p-3 border-r border-border font-medium text-xs md:text-sm">Resource</div>
      {weekDays.map((day) => {
        const isToday = isSameDay(day, today);
        return (
          <div
            key={day.toISOString()}
            className={`p-2 md:p-3 border-r border-border text-center ${isToday ? "bg-primary/10" : ""}`}
          >
            <div className="text-[10px] md:text-xs text-muted-foreground uppercase">{format(day, "EEE")}</div>
            <div className={`text-base md:text-lg font-semibold ${isToday ? "text-primary" : ""}`}>
              {format(day, "d")}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CrewScheduleView({
  currentDate,
  crews,
  assignments,
  jobs,
  invoices,
  isLoading,
}: {
  currentDate: Date;
  crews: Crew[];
  assignments: CrewAssignment[];
  jobs: Job[];
  invoices: Invoice[];
  isLoading: boolean;
}) {
  const weekDays = getWeekDays(currentDate);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (crews.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="text-lg font-semibold mb-2">No Crews Configured</h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Create crews in the settings to start scheduling work assignments.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <div className="min-w-[600px] md:min-w-[800px]">
          <DayHeaders weekDays={weekDays} />
          {crews.map((crew) => {
            const crewAssignments = assignments.filter((a) => a.crewId === crew.id);
            return (
              <CrewCalendarRow
                key={crew.id}
                crew={crew}
                weekDays={weekDays}
                assignments={crewAssignments}
                jobs={jobs}
                invoices={invoices}
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function EquipmentScheduleView({
  currentDate,
  equipmentList,
  reservations,
  jobs,
  invoices,
  isLoading,
}: {
  currentDate: Date;
  equipmentList: Equipment[];
  reservations: EquipmentReservation[];
  jobs: Job[];
  invoices: Invoice[];
  isLoading: boolean;
}) {
  const weekDays = getWeekDays(currentDate);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (equipmentList.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Truck className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="text-lg font-semibold mb-2">No Equipment Configured</h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Add equipment in the settings to track reservations and availability.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <div className="min-w-[600px] md:min-w-[800px]">
          <DayHeaders weekDays={weekDays} />
          {equipmentList.map((eq) => {
            const eqReservations = reservations.filter((r) => r.equipmentId === eq.id);
            return (
              <EquipmentCalendarRow
                key={eq.id}
                equipmentItem={eq}
                weekDays={weekDays}
                reservations={eqReservations}
                jobs={jobs}
                invoices={invoices}
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Scheduling() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState<string>("crews");
  const [showOverridesOnly, setShowOverridesOnly] = useState(false);
  const [schedulingError, setSchedulingError] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    action: SchedulingAction;
    itemName: string;
    scheduledDate?: string;
    onConfirm: () => void;
  }>({ open: false, action: 'remove_assignment', itemName: '', onConfirm: () => {} });

  const { showUndoToast } = useSchedulingUndo();

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });

  const { data: crews = [], isLoading: crewsLoading } = useQuery<Crew[]>({
    queryKey: ["/api/crews"],
  });

  const { data: equipmentList = [], isLoading: equipmentLoading } = useQuery<Equipment[]>({
    queryKey: ["/api/equipment"],
  });

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery<CrewAssignment[]>({
    queryKey: ["/api/crew-assignments", { startDate: format(weekStart, "yyyy-MM-dd"), endDate: format(weekEnd, "yyyy-MM-dd") }],
  });

  const { data: reservations = [], isLoading: reservationsLoading } = useQuery<EquipmentReservation[]>({
    queryKey: ["/api/equipment-reservations", { startDate: format(weekStart, "yyyy-MM-dd"), endDate: format(weekEnd, "yyyy-MM-dd") }],
  });

  const { data: jobs = [] } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
  });

  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ["/api/billing/invoices"],
  });

  const handlePrevWeek = () => setCurrentDate((d) => subWeeks(d, 1));
  const handleNextWeek = () => setCurrentDate((d) => addWeeks(d, 1));
  const handleToday = () => setCurrentDate(new Date());

  const isLoading = crewsLoading || equipmentLoading || assignmentsLoading || reservationsLoading;
  
  const overrideCount = assignments.filter(a => a.isOverridden).length + reservations.filter(r => r.isOverridden).length;
  
  const effectiveShowOverridesOnly = showOverridesOnly && overrideCount > 0;
  
  const filteredAssignments = effectiveShowOverridesOnly 
    ? assignments.filter(a => a.isOverridden) 
    : assignments;
  const filteredReservations = effectiveShowOverridesOnly 
    ? reservations.filter(r => r.isOverridden) 
    : reservations;

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-3xl font-semibold" data-testid="text-page-title">Scheduling</h1>
          <p className="text-muted-foreground text-xs md:text-sm mt-1">Manage crew schedules and equipment reservations</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:gap-4">
          {overrideCount > 0 && (
            <Button
              variant={effectiveShowOverridesOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setShowOverridesOnly(!showOverridesOnly)}
              className={`min-h-10 md:min-h-9 ${effectiveShowOverridesOnly ? "bg-orange-500 hover:bg-orange-600 border-orange-500" : "border-orange-400 text-orange-600 dark:text-orange-400"}`}
              data-testid="button-filter-overrides"
            >
              <AlertTriangle className="h-4 w-4 mr-1 md:mr-2" />
              <span className="hidden sm:inline">{effectiveShowOverridesOnly ? `Showing ${overrideCount} Override${overrideCount > 1 ? 's' : ''}` : `${overrideCount} Override${overrideCount > 1 ? 's' : ''}`}</span>
              <span className="sm:hidden">{overrideCount}</span>
            </Button>
          )}
          <WeekNavigation
            currentDate={currentDate}
            onPrevWeek={handlePrevWeek}
            onNextWeek={handleNextWeek}
            onToday={handleToday}
          />
        </div>
      </div>

      <SchedulingErrorBanner 
        error={schedulingError} 
        onDismiss={() => setSchedulingError(null)} 
      />

      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <Card>
          <CardHeader className="p-3 md:p-6 pb-2 flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-xs md:text-base font-semibold">Crews</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground hidden sm:block" />
          </CardHeader>
          <CardContent className="p-3 md:p-6 pt-0">
            <div className="text-xl md:text-2xl font-bold" data-testid="text-crews-count">{crews.length}</div>
            <p className="text-xs text-muted-foreground">Active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-3 md:p-6 pb-2 flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-xs md:text-base font-semibold">Assignments</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground hidden sm:block" />
          </CardHeader>
          <CardContent className="p-3 md:p-6 pt-0">
            <div className="text-xl md:text-2xl font-bold" data-testid="text-assignments-count">{assignments.length}</div>
            <p className="text-xs text-muted-foreground">This week</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-3 md:p-6 pb-2 flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-xs md:text-base font-semibold">Reservations</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground hidden sm:block" />
          </CardHeader>
          <CardContent className="p-3 md:p-6 pt-0">
            <div className="text-xl md:text-2xl font-bold" data-testid="text-reservations-count">{reservations.length}</div>
            <p className="text-xs text-muted-foreground">Booked</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full md:w-auto">
          <TabsTrigger value="crews" className="flex-1 md:flex-none min-h-10 md:min-h-9" data-testid="tab-crews">
            <Users className="h-4 w-4 mr-1 md:mr-2" />
            <span className="hidden sm:inline">Crew </span>Schedule
          </TabsTrigger>
          <TabsTrigger value="equipment" className="flex-1 md:flex-none min-h-10 md:min-h-9" data-testid="tab-equipment">
            <Truck className="h-4 w-4 mr-1 md:mr-2" />
            <span className="hidden sm:inline">Equipment </span>Schedule
          </TabsTrigger>
        </TabsList>

        <TabsContent value="crews" className="mt-4">
          <CrewScheduleView
            currentDate={currentDate}
            crews={crews}
            assignments={filteredAssignments}
            jobs={jobs}
            invoices={invoices}
            isLoading={isLoading}
          />
        </TabsContent>

        <TabsContent value="equipment" className="mt-4">
          <EquipmentScheduleView
            currentDate={currentDate}
            equipmentList={equipmentList}
            reservations={filteredReservations}
            jobs={jobs}
            invoices={invoices}
            isLoading={isLoading}
          />
        </TabsContent>
      </Tabs>

      <SchedulingConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}
        action={confirmDialog.action}
        itemName={confirmDialog.itemName}
        scheduledDate={confirmDialog.scheduledDate}
        onConfirm={confirmDialog.onConfirm}
      />
    </div>
  );
}
