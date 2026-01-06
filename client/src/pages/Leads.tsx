import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, AlertCircle, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Lead } from "@shared/schema";

const stageColors: Record<string, string> = {
  new: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  contacted: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  estimate_sent: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  follow_up: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  won: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  lost: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const stageLabels: Record<string, string> = {
  new: "NEW",
  contacted: "CONTACTED",
  estimate_sent: "ESTIMATE SENT",
  follow_up: "FOLLOW UP",
  won: "WON",
  lost: "LOST",
};

export default function Leads() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newLead, setNewLead] = useState({
    source: "",
    notes: "",
    priority: "normal",
  });

  const { data: leads, isLoading, error } = useQuery<Lead[]>({
    queryKey: ['/api/leads'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newLead) => {
      const response = await apiRequest("POST", "/api/leads", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'] });
      toast({ title: "Lead created", description: "New lead has been added to your pipeline." });
      setDialogOpen(false);
      setNewLead({ source: "", notes: "", priority: "normal" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateStageMutation = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const response = await apiRequest("PATCH", `/api/leads/${id}`, { stage });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'] });
      toast({ title: "Lead updated", description: "Lead stage has been changed." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/leads/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'] });
      toast({ title: "Lead deleted", description: "Lead has been removed." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const filteredLeads = leads?.filter((l) =>
    l.source?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.notes?.toLowerCase().includes(searchTerm.toLowerCase())
  ) ?? [];

  const handleSubmit = () => {
    createMutation.mutate(newLead);
  };

  const handleStageChange = (leadId: string, newStage: string) => {
    updateStageMutation.mutate({ id: leadId, stage: newStage });
  };

  const groupedLeads = {
    active: filteredLeads.filter((l) => !['won', 'lost'].includes(l.stage)),
    won: filteredLeads.filter((l) => l.stage === 'won'),
    lost: filteredLeads.filter((l) => l.stage === 'lost'),
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold" data-testid="text-page-title">Leads</h1>
          <p className="text-muted-foreground text-sm mt-1">Track and manage your sales pipeline</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-lead">
              <Plus className="h-4 w-4 mr-2" />
              Add Lead
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Lead</DialogTitle>
              <DialogDescription>Create a new lead to track in your pipeline.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="source">Source</Label>
                <Input
                  id="source"
                  placeholder="e.g., Website, Referral, Phone call"
                  value={newLead.source}
                  onChange={(e) => setNewLead({ ...newLead, source: e.target.value })}
                  data-testid="input-source"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select
                  value={newLead.priority}
                  onValueChange={(value) => setNewLead({ ...newLead, priority: value })}
                >
                  <SelectTrigger data-testid="select-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Initial contact details, customer needs..."
                  value={newLead.notes}
                  onChange={(e) => setNewLead({ ...newLead, notes: e.target.value })}
                  data-testid="input-notes"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel">Cancel</Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending} data-testid="button-save-lead">
                {createMutation.isPending ? "Saving..." : "Save Lead"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search leads..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
          data-testid="input-search"
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : error ? (
        <Card data-testid="error-leads">
          <CardContent className="py-8 text-center">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
            <p className="text-destructive font-medium">Failed to load leads</p>
            <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          <div>
            <h2 className="text-base font-semibold mb-4">Active Pipeline ({groupedLeads.active.length})</h2>
            {groupedLeads.active.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {groupedLeads.active.map((lead) => (
                  <Card key={lead.id} data-testid={`card-lead-${lead.id}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-sm font-medium">
                          {lead.source || 'Direct inquiry'}
                        </CardTitle>
                        <div className="flex items-center gap-1">
                          <Badge className={stageColors[lead.stage]}>
                            {stageLabels[lead.stage]}
                          </Badge>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6" data-testid={`button-delete-lead-${lead.id}`}>
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Lead</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete this lead? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteMutation.mutate(lead.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {lead.notes || 'No notes'}
                      </p>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          {new Date(lead.createdAt).toLocaleDateString()}
                        </span>
                        <Select
                          value={lead.stage}
                          onValueChange={(value) => handleStageChange(lead.id, value)}
                        >
                          <SelectTrigger className="w-32 h-8 text-xs" data-testid={`select-stage-${lead.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">New</SelectItem>
                            <SelectItem value="contacted">Contacted</SelectItem>
                            <SelectItem value="estimate_sent">Estimate Sent</SelectItem>
                            <SelectItem value="follow_up">Follow Up</SelectItem>
                            <SelectItem value="won">Won</SelectItem>
                            <SelectItem value="lost">Lost</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground">No active leads in the pipeline.</p>
                </CardContent>
              </Card>
            )}
          </div>

          {groupedLeads.won.length > 0 && (
            <div>
              <h2 className="text-base font-semibold mb-4">Won ({groupedLeads.won.length})</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {groupedLeads.won.map((lead) => (
                  <Card key={lead.id} className="opacity-75" data-testid={`card-lead-won-${lead.id}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-sm font-medium">
                          {lead.source || 'Direct inquiry'}
                        </CardTitle>
                        <Badge className={stageColors[lead.stage]}>
                          {stageLabels[lead.stage]}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {lead.notes || 'No notes'}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {groupedLeads.lost.length > 0 && (
            <div>
              <h2 className="text-base font-semibold mb-4">Lost ({groupedLeads.lost.length})</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {groupedLeads.lost.map((lead) => (
                  <Card key={lead.id} className="opacity-50" data-testid={`card-lead-lost-${lead.id}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-sm font-medium">
                          {lead.source || 'Direct inquiry'}
                        </CardTitle>
                        <Badge className={stageColors[lead.stage]}>
                          {stageLabels[lead.stage]}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {lead.lostReason || lead.notes || 'No notes'}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
