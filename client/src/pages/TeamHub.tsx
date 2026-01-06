import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Job } from "@shared/schema";
import { computeJobReadiness } from "@/utils/jobReadiness";

type Readiness = "PRE_ROPE_READY" | "AT_RISK" | "INCOMPLETE";

type JobWithReadiness = Job & {
  readiness: {
    status: Readiness;
    reasons: string[];
  };
};

export default function TeamHub() {
  const { data: jobs, isLoading, error } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
    queryFn: async () => {
      const res = await fetch("/api/jobs");
      if (!res.ok) {
        throw new Error("Failed to fetch jobs");
      }
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-destructive">
        Failed to load jobs.
      </div>
    );
  }

  const enriched: JobWithReadiness[] =
    jobs?.map((job) => ({
      ...job,
      readiness: computeJobReadiness(job),
    })) ?? [];

  const byStatus = (status: Readiness) =>
    enriched.filter((job) => job.readiness.status === status);

  const Section = ({
    title,
    status,
  }: {
    title: string;
    status: Readiness;
  }) => (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {byStatus(status).length === 0 && (
          <p className="text-sm text-muted-foreground">No jobs</p>
        )}

        {byStatus(status).map((job) => (
          <Link key={job.id} href={`/team/jobs/${job.id}`}>
            <a className="block rounded border p-3 hover:bg-muted transition-colors">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {"title" in job && job.title
                      ? job.title
                      : `Job #${job.id}`}
                  </div>
                  <div className="text-sm text-muted-foreground truncate">
                    {"address" in job && job.address
                      ? job.address
                      : "No address"}
                  </div>
                </div>

                <Badge variant="outline">
                  {job.readiness.status.replace("_", " ")}
                </Badge>
              </div>
            </a>
          </Link>
        ))}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <Section title="Pre-Rope Ready" status="PRE_ROPE_READY" />
      <Section title="At Risk" status="AT_RISK" />
      <Section title="Incomplete" status="INCOMPLETE" />
    </div>
  );
}
