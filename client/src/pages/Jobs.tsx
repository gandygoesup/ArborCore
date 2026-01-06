import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Briefcase, 
  Calendar, 
  Clock, 
  Users, 
  AlertTriangle, 
  AlertCircle,
  DollarSign, 
  Send, 
  Eye,
  Phone,
  ChevronRight,
  ShieldAlert,
  Play,
  CheckCircle
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Job, Invoice, Customer, CrewAssignment } from "@shared/schema";
import { format, isToday, isTomorrow, differenceInHours, addDays, startOfDay, endOfDay } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { emitStartJobBlocked, emitAtRiskJobDetected, emitAtRiskJobResolved } from "@/lib/analytics";

type AtRiskJob = Job & {
  customer?: Customer;
  invoice?: Invoice;
  hoursUntilScheduled?: number;
  riskReason: string;
};

function getAtRiskJobs(
  jobs: Job[], 
  invoices: Invoice[], 
  assignments: CrewAssignment[],
  customers: Customer[]
): AtRiskJob[] {
  const atRiskJobs: AtRiskJob[] = [];
  const invoicesByJobId = new Map(invoices.filter(i => i.jobId).map(i => [i.jobId, i]));
  const customersByIdMap = new Map(customers.map(c => [c.id, c]));
  const now = new Date();
  
  for (const job of jobs) {
    if (job.status === 'completed' || job.status === 'closed') {
      continue;
    }
    
    const invoice = invoicesByJobId.get(job.id);
    const customer = customersByIdMap.get(job.customerId);
    
    const jobAssignments = assignments.filter(a => a.jobId === job.id);
    const upcomingAssignment = jobAssignments
      .filter(a => a.scheduledDate && new Date(a.scheduledDate) >= now)
      .sort((a, b) => new Date(a.scheduledDate!).getTime() - new Date(b.scheduledDate!).getTime())[0];
    
    let isAtRisk = false;
    let riskReason = '';
    let hoursUntilScheduled: number | undefined;
    
    if (invoice?.status === 'disputed') {
      isAtRisk = true;
      riskReason = job.status === 'cancelled' ? 'Cancelled - Payment disputed (unresolved)' : 'Payment disputed';
    }
    
    if (job.status === 'cancelled' && !invoice?.status?.includes('disputed')) {
      continue;
    }
    
    if (!job.depositPaid && (job.status === 'scheduled' || job.status === 'in_progress')) {
      isAtRisk = true;
      riskReason = riskReason ? `${riskReason}, Deposit unpaid` : 'Deposit unpaid';
      
      if (upcomingAssignment?.scheduledDate) {
        const assignmentDate = new Date(upcomingAssignment.scheduledDate);
        hoursUntilScheduled = differenceInHours(assignmentDate, now);
        
        if (hoursUntilScheduled <= 48 && hoursUntilScheduled > 0) {
          riskReason = `${riskReason} - scheduled in ${hoursUntilScheduled}h`;
        }
      }
    }
    
    if (isAtRisk) {
      atRiskJobs.push({
        ...job,
        customer,
        invoice,
        hoursUntilScheduled,
        riskReason
      });
    }
  }
  
  return atRiskJobs.sort((a, b) => {
    if (a.hoursUntilScheduled !== undefined && b.hoursUntilScheduled !== undefined) {
      return a.hoursUntilScheduled - b.hoursUntilScheduled;
    }
    if (a.hoursUntilScheduled !== undefined) return -1;
    if (b.hoursUntilScheduled !== undefined) return 1;
    return 0;
  });
}

function AtRiskJobCard({ job }: { job: AtRiskJob }) {
  const isUrgent = job.hoursUntilScheduled !== undefined && job.hoursUntilScheduled <= 48;
  
  return (
    <Card className={`${isUrgent ? 'border-destructive/50 bg-destructive/5' : 'border-amber-500/50 bg-amber-500/5'}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className={`h-4 w-4 flex-shrink-0 ${isUrgent ? 'text-destructive' : 'text-amber-500'}`} />
              <span className="font-medium truncate" data-testid={`text-job-title-${job.id}`}>
                {job.title || `Job #${job.id}`}
              </span>
              {isUrgent && (
                <Badge variant="destructive" className="animate-pulse text-xs" data-testid={`badge-urgent-${job.id}`}>
                  {job.hoursUntilScheduled}h
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground truncate" data-testid={`text-customer-${job.id}`}>
              {job.customer ? `${job.customer.firstName} ${job.customer.lastName}` : 'Unknown Customer'}
            </p>
            <p className={`text-xs mt-1 ${isUrgent ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'}`} data-testid={`text-risk-reason-${job.id}`}>
              {job.riskReason}
            </p>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" data-testid={`button-view-${job.id}`}>
                  <Eye className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>View Details</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" data-testid={`button-send-reminder-${job.id}`}>
                  <Send className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Send Payment Reminder</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" data-testid={`button-call-${job.id}`}>
                  <Phone className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Call Customer</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AtRiskJobsQueue({ 
  atRiskJobs, 
  isLoading 
}: { 
  atRiskJobs: AtRiskJob[]; 
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }
  
  if (atRiskJobs.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-8">
          <ShieldAlert className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground text-center" data-testid="text-no-at-risk">
            No jobs at risk. All deposits are collected.
          </p>
        </CardContent>
      </Card>
    );
  }
  
  const urgentJobs = atRiskJobs.filter(j => j.hoursUntilScheduled !== undefined && j.hoursUntilScheduled <= 48);
  const otherAtRiskJobs = atRiskJobs.filter(j => j.hoursUntilScheduled === undefined || j.hoursUntilScheduled > 48);
  
  return (
    <div className="space-y-4">
      {urgentJobs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span data-testid="text-urgent-section">Urgent - Within 48 Hours ({urgentJobs.length})</span>
          </div>
          <div className="space-y-2">
            {urgentJobs.map(job => (
              <AtRiskJobCard key={job.id} job={job} />
            ))}
          </div>
        </div>
      )}
      
      {otherAtRiskJobs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
            <DollarSign className="h-4 w-4" />
            <span data-testid="text-other-at-risk-section">Other At Risk Jobs ({otherAtRiskJobs.length})</span>
          </div>
          <div className="space-y-2">
            {otherAtRiskJobs.map(job => (
              <AtRiskJobCard key={job.id} job={job} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface TodayJobCardProps {
  job: Job;
  customer?: Customer;
  invoice?: Invoice;
}

function TodayJobCard({ job, customer, invoice }: TodayJobCardProps) {
  const [startAttempted, setStartAttempted] = useState(false);
  
  const getStatusColor = () => {
    switch (job.status) {
      case 'in_progress': return 'bg-blue-500/10 text-blue-700 dark:text-blue-400';
      case 'scheduled': return 'bg-green-500/10 text-green-700 dark:text-green-400';
      case 'completed': return 'bg-muted text-muted-foreground';
      default: return 'bg-amber-500/10 text-amber-700 dark:text-amber-400';
    }
  };
  
  const isAtRisk = !job.depositPaid && (job.status === 'scheduled' || job.status === 'in_progress');
  const isDisputed = invoice?.status === 'disputed';
  const canStart = job.depositPaid && job.status === 'scheduled' && !isDisputed;
  const isBlocked = !job.depositPaid || isDisputed;
  
  const getBlockReason = () => {
    if (isDisputed) return 'Payment is disputed - contact office';
    if (!job.depositPaid) return 'Deposit not yet collected';
    return '';
  };
  
  const handleStartClick = () => {
    if (!canStart) {
      setStartAttempted(true);
      
      const reason = isDisputed 
        ? 'payment_disputed' 
        : !job.depositPaid 
          ? 'deposit_not_paid' 
          : 'job_cancelled';
      
      emitStartJobBlocked({
        jobId: job.id,
        reason,
      });
      return;
    }
  };
  
  return (
    <Card className={`${isDisputed ? 'border-red-500/50' : isAtRisk ? 'border-amber-500/50' : ''}`}>
      <CardContent className="p-3 md:p-4 space-y-2 md:space-y-3">
        {isBlocked && (
          <div 
            className={`flex items-center gap-2 text-sm px-3 py-2 rounded-md ${
              isDisputed 
                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' 
                : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
            }`}
            data-testid={`banner-blocked-${job.id}`}
          >
            {isDisputed ? <AlertCircle className="h-4 w-4 flex-shrink-0" /> : <AlertTriangle className="h-4 w-4 flex-shrink-0" />}
            <span>{getBlockReason()}</span>
          </div>
        )}
        
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-medium truncate" data-testid={`text-today-job-title-${job.id}`}>
                {job.title || `Job #${job.id}`}
              </span>
              <Badge variant="outline" className={getStatusColor()} data-testid={`badge-status-${job.id}`}>
                {job.status.replace('_', ' ')}
              </Badge>
              {job.depositPaid ? (
                <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400 text-xs" data-testid={`badge-deposit-paid-${job.id}`}>
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Deposit Paid
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs" data-testid={`badge-deposit-unpaid-${job.id}`}>
                  <DollarSign className="h-3 w-3 mr-1" />
                  Deposit Due
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground truncate">
              {customer ? `${customer.firstName} ${customer.lastName}` : 'Unknown Customer'}
            </p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {job.status === 'scheduled' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  size="default"
                  variant={canStart ? "default" : "outline"}
                  onClick={handleStartClick}
                  className={`min-h-10 md:min-h-9 ${!canStart ? "opacity-60" : ""}`}
                  aria-disabled={!canStart}
                  data-testid={`button-start-job-${job.id}`}
                >
                  <Play className="h-4 w-4 mr-1" />
                  Start Job
                </Button>
              </TooltipTrigger>
              {!canStart && (
                <TooltipContent>
                  <p>{getBlockReason()}</p>
                </TooltipContent>
              )}
            </Tooltip>
          )}
          {job.status === 'in_progress' && (
            <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-400" data-testid={`badge-in-progress-${job.id}`}>
              <Clock className="h-3 w-3 mr-1" />
              Work In Progress
            </Badge>
          )}
          <Button variant="ghost" className="min-h-10 md:min-h-9" data-testid={`button-view-today-job-${job.id}`}>
            <Eye className="h-4 w-4 mr-1" />
            Details
          </Button>
          {customer?.phone && (
            <Button size="icon" variant="ghost" className="min-h-10 min-w-10 md:min-h-9 md:min-w-9" data-testid={`button-call-customer-${job.id}`}>
              <Phone className="h-4 w-4" />
            </Button>
          )}
        </div>
        
        {startAttempted && !canStart && (
          <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded" data-testid={`error-start-blocked-${job.id}`}>
            <AlertCircle className="h-3 w-3" />
            Cannot start: {getBlockReason()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Jobs() {
  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);
  
  const { data: jobs = [], isLoading: jobsLoading } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
  });
  
  const { data: invoices = [], isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/billing/invoices"],
  });
  
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });
  
  const { data: assignments = [] } = useQuery<CrewAssignment[]>({
    queryKey: ["/api/crew-assignments"],
  });
  
  const { data: crews = [] } = useQuery({
    queryKey: ["/api/crews"],
  });
  
  const isLoading = jobsLoading || invoicesLoading;
  
  const atRiskJobs = getAtRiskJobs(jobs, invoices, assignments, customers);
  
  const trackedAtRiskJobIds = useRef<Set<string>>(new Set());
  
  useEffect(() => {
    if (isLoading) return;
    
    atRiskJobs.forEach(job => {
      if (!trackedAtRiskJobIds.current.has(job.id)) {
        trackedAtRiskJobIds.current.add(job.id);
        emitAtRiskJobDetected({
          jobId: job.id,
          reason: job.riskReason,
          hoursUntilScheduled: job.hoursUntilScheduled,
          hasDispute: job.invoice?.status === 'disputed',
          depositPaid: job.depositPaid,
        });
      }
    });
    
    const currentAtRiskIds = new Set(atRiskJobs.map(j => j.id));
    const jobsById = new Map(jobs.map(j => [j.id, j]));
    const invoicesByJobId = new Map(invoices.filter(i => i.jobId).map(i => [i.jobId, i]));
    
    trackedAtRiskJobIds.current.forEach(id => {
      if (!currentAtRiskIds.has(id)) {
        trackedAtRiskJobIds.current.delete(id);
        
        const job = jobsById.get(id);
        const invoice = invoicesByJobId.get(id);
        let resolution: 'deposit_paid' | 'dispute_resolved' | 'job_cancelled' | 'rescheduled' = 'rescheduled';
        
        if (job) {
          if (job.depositPaid) {
            resolution = 'deposit_paid';
          } else if (job.status === 'cancelled') {
            resolution = 'job_cancelled';
          } else if (invoice && invoice.status !== 'disputed') {
            resolution = 'dispute_resolved';
          }
        }
        
        emitAtRiskJobResolved({
          jobId: id,
          resolution,
        });
      }
    });
  }, [atRiskJobs, isLoading, jobs, invoices]);
  
  const todayJobIds = new Set(
    assignments
      .filter(a => {
        if (!a.scheduledDate) return false;
        const assignmentDate = new Date(a.scheduledDate);
        return isToday(assignmentDate);
      })
      .map(a => a.jobId)
  );
  
  const todayJobs = jobs.filter(j => todayJobIds.has(j.id) && j.status !== 'cancelled');
  const inProgressJobs = jobs.filter(j => j.status === 'in_progress');
  
  const customerMap = new Map(customers.map(c => [c.id, c]));
  const invoiceByJobId = new Map(invoices.filter(i => i.jobId).map(i => [i.jobId, i]));
  
  const crewsOut = Array.isArray(crews) && crews.length > 0 ? 
    assignments.filter(a => a.scheduledDate && isToday(new Date(a.scheduledDate))).length : 0;
  
  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 md:p-6 border-b">
        <div>
          <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">Jobs</h1>
          <p className="text-sm md:text-base text-muted-foreground" data-testid="text-page-subtitle">Today's work and crew assignments</p>
        </div>
        <div className="flex gap-2">
          <Link href="/scheduling">
            <Button variant="outline" size="sm" className="md:size-default" data-testid="button-view-schedule">
              <Calendar className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">View </span>Schedule
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex-1 p-4 md:p-6 overflow-auto">
        <div className="grid grid-cols-2 gap-3 md:gap-6 md:grid-cols-2 lg:grid-cols-4 mb-6 md:mb-8" data-testid="jobs-stats-grid">
          <Card data-testid="card-today-count">
            <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 md:p-6 pb-2">
              <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">
                Today
              </CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground hidden sm:block" />
            </CardHeader>
            <CardContent className="p-3 md:p-6 pt-0">
              <div className="text-2xl md:text-3xl font-bold" data-testid="stat-today-count">
                {isLoading ? <Skeleton className="h-8 w-8" /> : todayJobs.length}
              </div>
              <p className="text-xs text-muted-foreground">jobs scheduled</p>
            </CardContent>
          </Card>
          <Card data-testid="card-in-progress-count">
            <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 md:p-6 pb-2">
              <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">
                In Progress
              </CardTitle>
              <Briefcase className="h-4 w-4 text-muted-foreground hidden sm:block" />
            </CardHeader>
            <CardContent className="p-3 md:p-6 pt-0">
              <div className="text-2xl md:text-3xl font-bold" data-testid="stat-in-progress-count">
                {isLoading ? <Skeleton className="h-8 w-8" /> : inProgressJobs.length}
              </div>
              <p className="text-xs text-muted-foreground">active jobs</p>
            </CardContent>
          </Card>
          <Card data-testid="card-crews-count">
            <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 md:p-6 pb-2">
              <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">
                Crews Out
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground hidden sm:block" />
            </CardHeader>
            <CardContent className="p-3 md:p-6 pt-0">
              <div className="text-2xl md:text-3xl font-bold" data-testid="stat-crews-count">
                {isLoading ? <Skeleton className="h-8 w-8" /> : crewsOut}
              </div>
              <p className="text-xs text-muted-foreground">working today</p>
            </CardContent>
          </Card>
          <Card className={atRiskJobs.length > 0 ? 'border-amber-500/50' : ''} data-testid="card-at-risk-count">
            <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 md:p-6 pb-2">
              <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">
                At Risk
              </CardTitle>
              <AlertTriangle className={`h-4 w-4 hidden sm:block ${atRiskJobs.length > 0 ? 'text-amber-500' : 'text-muted-foreground'}`} />
            </CardHeader>
            <CardContent className="p-3 md:p-6 pt-0">
              <div className={`text-2xl md:text-3xl font-bold ${atRiskJobs.length > 0 ? 'text-amber-600 dark:text-amber-400' : ''}`} data-testid="stat-at-risk-count">
                {isLoading ? <Skeleton className="h-8 w-8" /> : atRiskJobs.length}
              </div>
              <p className="text-xs text-muted-foreground">need attention</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
          <div className="space-y-3 md:space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base md:text-lg font-semibold" data-testid="text-at-risk-section">At Risk Jobs</h2>
              <Badge variant={atRiskJobs.length > 0 ? "destructive" : "outline"} data-testid="badge-at-risk-count">
                {atRiskJobs.length}
              </Badge>
            </div>
            <AtRiskJobsQueue atRiskJobs={atRiskJobs} isLoading={isLoading} />
          </div>
          
          <div className="space-y-3 md:space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base md:text-lg font-semibold" data-testid="text-today-section">Today's Jobs</h2>
              <Badge variant="outline" data-testid="badge-today-count">{todayJobs.length}</Badge>
            </div>
            
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : todayJobs.length === 0 ? (
              <Card className="border-dashed" data-testid="card-empty-state">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Briefcase className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="font-medium mb-1" data-testid="text-empty-title">No jobs scheduled today</h3>
                  <p className="text-sm text-muted-foreground text-center max-w-sm" data-testid="text-empty-message">
                    Jobs will appear here once estimates are approved and scheduled. 
                    Go to Pipeline to create estimates.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {todayJobs.map(job => (
                  <TodayJobCard 
                    key={job.id} 
                    job={job} 
                    customer={customerMap.get(job.customerId)}
                    invoice={invoiceByJobId.get(job.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
