import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, CalendarClock } from "lucide-react";

export type FeatureStatus = "live" | "in_progress" | "planned";

interface FeatureStatusBadgeProps {
  status: FeatureStatus;
  className?: string;
}

const statusConfig: Record<FeatureStatus, { label: string; icon: typeof CheckCircle2; className: string }> = {
  live: {
    label: "Live",
    icon: CheckCircle2,
    className: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
  },
  in_progress: {
    label: "In Progress",
    icon: Clock,
    className: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20",
  },
  planned: {
    label: "Planned",
    icon: CalendarClock,
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  },
};

export function FeatureStatusBadge({ status, className = "" }: FeatureStatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge 
      variant="outline" 
      className={`${config.className} ${className} gap-1 font-medium`}
      data-testid={`badge-status-${status}`}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

export function FeatureStatusLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm" data-testid="feature-status-legend">
      <FeatureStatusBadge status="live" />
      <FeatureStatusBadge status="in_progress" />
      <FeatureStatusBadge status="planned" />
    </div>
  );
}
