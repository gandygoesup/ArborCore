import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, Users, Calendar, TrendingUp } from "lucide-react";
import type { Customer, Lead } from "@shared/schema";

export default function Home() {
  const { user } = useAuth();
  
  const { data: customers, isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ['/api/customers'],
  });
  
  const { data: leads, isLoading: leadsLoading } = useQuery<Lead[]>({
    queryKey: ['/api/leads'],
  });

  const isLoading = customersLoading || leadsLoading;

  const metrics = [
    {
      title: "TOTAL CUSTOMERS",
      value: customers?.length ?? 0,
      icon: Users,
      description: "Active customer accounts",
    },
    {
      title: "ACTIVE LEADS",
      value: leads?.filter(l => !['won', 'lost'].includes(l.stage)).length ?? 0,
      icon: TrendingUp,
      description: "In your pipeline",
    },
    {
      title: "WON THIS MONTH",
      value: leads?.filter(l => l.stage === 'won').length ?? 0,
      icon: DollarSign,
      description: "Converted leads",
    },
    {
      title: "SCHEDULED",
      value: 0,
      icon: Calendar,
      description: "Upcoming jobs",
    },
  ];

  const recentLeads = leads?.slice(0, 5) ?? [];

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-semibold" data-testid="text-dashboard-title">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Welcome back{user?.firstName ? `, ${user.firstName}` : ''}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold tracking-wider text-muted-foreground">
                {metric.title}
              </CardTitle>
              <metric.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-semibold font-mono" data-testid={`metric-${metric.title.toLowerCase().replace(/\s/g, '-')}`}>
                  {metric.value}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">{metric.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Recent Leads</CardTitle>
            <CardDescription>Latest additions to your pipeline</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : recentLeads.length > 0 ? (
              <div className="space-y-3">
                {recentLeads.map((lead) => (
                  <div
                    key={lead.id}
                    className="flex items-center justify-between gap-4 p-3 rounded-md bg-muted/50"
                    data-testid={`lead-row-${lead.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {lead.source || 'Direct inquiry'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {lead.notes?.substring(0, 50) || 'No notes'}
                      </p>
                    </div>
                    <span className="text-xs font-semibold tracking-wider uppercase px-2 py-1 rounded-full bg-accent">
                      {lead.stage.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No leads yet. Start adding leads to see them here.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
            <CardDescription>Common tasks to get you started</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="p-3 rounded-md bg-muted/50">
                <p className="font-medium">Add a new customer</p>
                <p className="text-xs text-muted-foreground">Go to CRM to create customer records</p>
              </div>
              <div className="p-3 rounded-md bg-muted/50">
                <p className="font-medium">Create an estimate</p>
                <p className="text-xs text-muted-foreground">Build professional estimates for jobs</p>
              </div>
              <div className="p-3 rounded-md bg-muted/50">
                <p className="font-medium">Configure cost profile</p>
                <p className="text-xs text-muted-foreground">Set up your labor, overhead, and equipment costs</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
