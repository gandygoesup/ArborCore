import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Job } from "@shared/schema";
import { computeJobReadiness } from "@/utils/jobReadiness";

export default function JobTruthSheet() {
  const { jobId } = useParams() as { jobId: string };

  const { data: job, isLoading } = useQuery<Job>({
    queryKey: [`/api/jobs/${jobId}`],
  });

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (!job) {
    return <div className="text-sm text-muted-foreground">Job not found</div>;
  }

  const readiness = computeJobReadiness(job);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Job Truth Sheet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="font-medium">
            {job.title || `Job #${job.id}`}
          </div>

          <div className="text-sm text-muted-foreground">
            {job.address || "No address"}
          </div>

          <Badge variant="outline">
            {readiness.status.replaceAll("_", " ")}
          </Badge>

          {readiness.reasons.length > 0 && (
            <ul className="mt-2 list-disc pl-4 text-sm">
              {readiness.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scope</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            {job.scopeSummary || "No scope summary provided."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
