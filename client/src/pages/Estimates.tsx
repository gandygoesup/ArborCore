import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Search, AlertCircle, FileText, ExternalLink } from "lucide-react";
import type { Estimate, Customer, Property } from "@shared/schema";

type EstimateStatus = "draft" | "sent" | "approved" | "rejected" | "expired" | "superseded";

const statusConfig: Record<EstimateStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "Draft", variant: "secondary" },
  sent: { label: "Sent", variant: "default" },
  approved: { label: "Approved", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
  expired: { label: "Expired", variant: "outline" },
  superseded: { label: "Superseded", variant: "outline" },
};

interface EstimateWithDetails extends Estimate {
  customer: Customer | null;
  property: Property | null;
  latestTotal: string | null;
}

function formatCurrency(amount: string | null | undefined): string {
  if (!amount) return "-";
  const num = parseFloat(amount);
  if (isNaN(num)) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

export default function Estimates() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<EstimateStatus | "all">("all");

  const { data: estimates, isLoading, error } = useQuery<EstimateWithDetails[]>({
    queryKey: ['/api/estimates'],
  });

  const filteredEstimates = (estimates ?? []).filter((est) => {
    const searchLower = searchTerm.toLowerCase();
    const customerName = est.customer 
      ? `${est.customer.firstName} ${est.customer.lastName}`.toLowerCase() 
      : "";
    const propertyAddress = est.property?.address?.toLowerCase() ?? "";
    const propertyCity = est.property?.city?.toLowerCase() ?? "";
    const propertyZip = est.property?.zipCode?.toLowerCase() ?? "";
    
    const matchesSearch = 
      est.estimateNumber.toLowerCase().includes(searchLower) ||
      (est.title?.toLowerCase().includes(searchLower) ?? false) ||
      customerName.includes(searchLower) ||
      propertyAddress.includes(searchLower) ||
      propertyCity.includes(searchLower) ||
      propertyZip.includes(searchLower);
    
    const matchesStatus = statusFilter === "all" || est.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const statusCounts = (estimates ?? []).reduce((acc, est) => {
    const status = est.status as EstimateStatus;
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {} as Record<EstimateStatus, number>);

  const handleNewEstimate = () => {
    setLocation("/estimates/new");
  };

  const handleOpenEstimate = (id: string) => {
    setLocation(`/estimates/${id}`);
  };

  const filterStatuses: (EstimateStatus | "all")[] = ["all", "draft", "sent", "approved", "rejected"];

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold" data-testid="text-page-title">Estimates</h1>
          <p className="text-muted-foreground text-sm mt-1">Create and manage customer estimates</p>
        </div>
        <Button onClick={handleNewEstimate} data-testid="button-new-estimate">
          <Plus className="h-4 w-4 mr-2" />
          New Estimate
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {filterStatuses.map((status) => {
          const isActive = statusFilter === status;
          const count = status === "all" 
            ? (estimates ?? []).length 
            : (statusCounts[status] || 0);
          
          return (
            <Badge
              key={status}
              variant={isActive ? "default" : "outline"}
              className={`cursor-pointer ${isActive ? "" : "toggle-elevate"}`}
              onClick={() => setStatusFilter(status)}
              data-testid={`filter-${status}`}
            >
              {status === "all" ? "All" : statusConfig[status].label}
              <span className="ml-1.5 text-xs opacity-70">({count})</span>
            </Badge>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by estimate #, customer, title, or address..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-md"
              data-testid="input-search"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8" data-testid="error-estimates">
              <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
              <p className="text-destructive font-medium">Failed to load estimates</p>
              <p className="text-sm text-muted-foreground mt-1">{(error as Error).message}</p>
            </div>
          ) : filteredEstimates.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-semibold tracking-wider uppercase">ESTIMATE #</TableHead>
                  <TableHead className="text-xs font-semibold tracking-wider uppercase">CUSTOMER</TableHead>
                  <TableHead className="text-xs font-semibold tracking-wider uppercase">ADDRESS</TableHead>
                  <TableHead className="text-xs font-semibold tracking-wider uppercase">STATUS</TableHead>
                  <TableHead className="text-xs font-semibold tracking-wider uppercase text-right">TOTAL</TableHead>
                  <TableHead className="text-xs font-semibold tracking-wider uppercase">CREATED</TableHead>
                  <TableHead className="text-xs font-semibold tracking-wider uppercase text-right">ACTIONS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEstimates.map((estimate) => {
                  const config = statusConfig[estimate.status as EstimateStatus] || statusConfig.draft;
                  return (
                    <TableRow key={estimate.id} data-testid={`row-estimate-${estimate.id}`}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-1.5">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          {estimate.estimateNumber}
                        </span>
                      </TableCell>
                      <TableCell>
                        {estimate.customer ? (
                          `${estimate.customer.firstName} ${estimate.customer.lastName}`
                        ) : (
                          <span className="text-muted-foreground">Unknown</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {estimate.property ? (
                          <span title={estimate.property.address}>
                            {estimate.property.address}
                            {estimate.property.city && `, ${estimate.property.city}`}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={config.variant} data-testid={`badge-status-${estimate.id}`}>
                          {config.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium" data-testid={`total-${estimate.id}`}>
                        {formatCurrency(estimate.latestTotal)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(estimate.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenEstimate(estimate.id)}
                          data-testid={`button-open-${estimate.id}`}
                        >
                          <ExternalLink className="h-4 w-4 mr-1" />
                          Open
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">No estimates found</p>
              <p className="text-sm text-muted-foreground mt-1">
                {statusFilter !== "all" 
                  ? `No ${statusConfig[statusFilter].label.toLowerCase()} estimates match your search.`
                  : "Create your first estimate to get started."}
              </p>
              {statusFilter === "all" && (estimates ?? []).length === 0 && (
                <Button onClick={handleNewEstimate} className="mt-4" data-testid="button-create-first">
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Estimate
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
