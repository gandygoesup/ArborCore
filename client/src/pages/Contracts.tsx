import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, AlertCircle, FileText, Send, MoreHorizontal, Eye, CheckCircle2, Clock, Ban } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Contract, Customer } from "@shared/schema";

type ContractStatus = "draft" | "sent" | "signed" | "expired" | "voided";

const statusConfig: Record<ContractStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: typeof CheckCircle2 }> = {
  draft: { label: "Draft", variant: "secondary", icon: FileText },
  sent: { label: "Sent", variant: "default", icon: Clock },
  signed: { label: "Signed", variant: "default", icon: CheckCircle2 },
  expired: { label: "Expired", variant: "outline", icon: Ban },
  voided: { label: "Voided", variant: "destructive", icon: Ban },
};

interface ContractWithDetails extends Contract {
  customer: Customer | null;
}

function formatCurrency(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined) return "-";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function Contracts() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<ContractStatus | "all">("all");
  const { toast } = useToast();

  const { data: contracts, isLoading, error } = useQuery<ContractWithDetails[]>({
    queryKey: ['/api/contracts'],
  });

  const sendMutation = useMutation({
    mutationFn: async ({ contractId, deliveryMethod }: { contractId: string; deliveryMethod: string }) => {
      const res = await apiRequest("POST", `/api/contracts/${contractId}/send`, { deliveryMethod });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to send contract");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Contract sent successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/contracts'] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send contract",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const filteredContracts = (contracts ?? []).filter((contract) => {
    const searchLower = searchTerm.toLowerCase();
    const customerName = contract.customer 
      ? `${contract.customer.firstName} ${contract.customer.lastName}`.toLowerCase() 
      : "";
    
    const matchesSearch = 
      contract.contractNumber.toLowerCase().includes(searchLower) ||
      customerName.includes(searchLower);
    
    const matchesStatus = statusFilter === "all" || contract.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const statusCounts = (contracts ?? []).reduce((acc, contract) => {
    const status = contract.status as ContractStatus;
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {} as Record<ContractStatus, number>);

  const handleViewContract = (id: string) => {
    setLocation(`/contracts/${id}`);
  };

  const handleSendContract = (contractId: string, deliveryMethod: string) => {
    sendMutation.mutate({ contractId, deliveryMethod });
  };

  const filterStatuses: (ContractStatus | "all")[] = ["all", "draft", "sent", "signed", "expired", "voided"];

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold" data-testid="text-page-title">Contracts</h1>
          <p className="text-muted-foreground text-sm mt-1">View and manage service agreements</p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap pb-4">
          <div className="flex items-center gap-2 flex-wrap">
            {filterStatuses.map((status) => {
              const isActive = statusFilter === status;
              const count = status === "all" 
                ? contracts?.length || 0 
                : statusCounts[status as ContractStatus] || 0;
              
              return (
                <Button
                  key={status}
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter(status)}
                  data-testid={`button-filter-${status}`}
                >
                  {status === "all" ? "All" : statusConfig[status as ContractStatus].label}
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {count}
                  </Badge>
                </Button>
              );
            })}
          </div>
          <div className="relative w-full sm:w-auto min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search contracts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
              data-testid="input-search"
            />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
              <p className="text-muted-foreground">Failed to load contracts</p>
            </div>
          ) : filteredContracts.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">
                {searchTerm || statusFilter !== "all" 
                  ? "No contracts match your filters" 
                  : "No contracts yet. Contracts are automatically created when estimates are approved."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contract #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Signed</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContracts.map((contract) => {
                  const config = statusConfig[contract.status as ContractStatus] || statusConfig.draft;
                  const StatusIcon = config.icon;
                  const snapshot = contract.estimateSnapshot as any;
                  const total = snapshot?.total;

                  return (
                    <TableRow
                      key={contract.id}
                      className="cursor-pointer"
                      onClick={() => handleViewContract(contract.id)}
                      data-testid={`row-contract-${contract.id}`}
                    >
                      <TableCell className="font-medium" data-testid={`text-contract-number-${contract.id}`}>
                        {contract.contractNumber}
                      </TableCell>
                      <TableCell data-testid={`text-customer-${contract.id}`}>
                        {contract.customer 
                          ? `${contract.customer.firstName} ${contract.customer.lastName}` 
                          : "-"}
                      </TableCell>
                      <TableCell data-testid={`text-total-${contract.id}`}>
                        {formatCurrency(total)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={config.variant} data-testid={`badge-status-${contract.id}`}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {config.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(contract.createdAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {contract.signedAt ? formatDate(contract.signedAt) : "-"}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" data-testid={`button-actions-${contract.id}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleViewContract(contract.id); }}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            {(contract.status === "draft" || contract.status === "sent") && (
                              <>
                                <DropdownMenuItem 
                                  onClick={(e) => { e.stopPropagation(); handleSendContract(contract.id, "email"); }}
                                  disabled={sendMutation.isPending}
                                >
                                  <Send className="h-4 w-4 mr-2" />
                                  Send via Email
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={(e) => { e.stopPropagation(); handleSendContract(contract.id, "sms"); }}
                                  disabled={sendMutation.isPending}
                                >
                                  <Send className="h-4 w-4 mr-2" />
                                  Send via SMS
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
