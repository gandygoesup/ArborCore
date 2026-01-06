import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Shield, Plus, Pencil, Trash2, Lock, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type Role = {
  id: string;
  name: string;
  description: string | null;
  companyId: string;
  isSystemRole: boolean;
  isDefault: boolean;
};

type Permission = {
  id: string;
  module: string;
  action: string;
  description: string | null;
  isDangerGate: boolean;
};

function groupPermissionsByModule(permissions: Permission[]): Record<string, Permission[]> {
  return permissions.reduce((acc, perm) => {
    if (!acc[perm.module]) {
      acc[perm.module] = [];
    }
    acc[perm.module].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);
}

function formatModuleName(module: string): string {
  return module
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatActionName(action: string): string {
  return action
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function RoleManagement() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);

  const { data: roles, isLoading: loadingRoles } = useQuery<Role[]>({
    queryKey: ["/api/roles"],
  });

  const { data: permissions, isLoading: loadingPermissions } = useQuery<Permission[]>({
    queryKey: ["/api/permissions"],
  });

  const { data: rolePermissions, isLoading: loadingRolePermissions } = useQuery<Permission[]>({
    queryKey: ["/api/roles", expandedRoleId, "permissions"],
    queryFn: async () => {
      if (!expandedRoleId) return [];
      const response = await fetch(`/api/roles/${expandedRoleId}/permissions`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch role permissions");
      }
      return response.json();
    },
    enabled: !!expandedRoleId,
  });

  const createRoleMutation = useMutation({
    mutationFn: async ({ name, description }: { name: string; description: string }) => {
      const response = await apiRequest("POST", "/api/roles", { name, description });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create role");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      toast({ title: "Role created successfully" });
      setIsCreateDialogOpen(false);
      setRoleName("");
      setRoleDescription("");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create role", description: error.message, variant: "destructive" });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, name, description }: { id: string; name: string; description: string }) => {
      const response = await apiRequest("PUT", `/api/roles/${id}`, { name, description });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update role");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      toast({ title: "Role updated successfully" });
      setIsEditDialogOpen(false);
      setSelectedRole(null);
      setRoleName("");
      setRoleDescription("");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update role", description: error.message, variant: "destructive" });
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/roles/${id}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to delete role");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      toast({ title: "Role deleted successfully" });
      setIsDeleteDialogOpen(false);
      setSelectedRole(null);
      if (expandedRoleId === selectedRole?.id) {
        setExpandedRoleId(null);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete role", description: error.message, variant: "destructive" });
    },
  });

  const updatePermissionsMutation = useMutation({
    mutationFn: async ({ roleId, permissionIds }: { roleId: string; permissionIds: string[] }) => {
      const response = await apiRequest("PUT", `/api/roles/${roleId}/permissions`, { permissionIds });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update permissions");
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles", variables.roleId, "permissions"] });
      toast({ title: "Permissions updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update permissions", description: error.message, variant: "destructive" });
    },
  });

  const handleCreateRole = () => {
    if (!roleName.trim()) {
      toast({ title: "Please enter a role name", variant: "destructive" });
      return;
    }
    createRoleMutation.mutate({ name: roleName, description: roleDescription });
  };

  const handleUpdateRole = () => {
    if (!selectedRole || !roleName.trim()) {
      toast({ title: "Please enter a role name", variant: "destructive" });
      return;
    }
    updateRoleMutation.mutate({ id: selectedRole.id, name: roleName, description: roleDescription });
  };

  const handleDeleteRole = () => {
    if (!selectedRole) return;
    deleteRoleMutation.mutate(selectedRole.id);
  };

  const openEditDialog = (role: Role) => {
    setSelectedRole(role);
    setRoleName(role.name);
    setRoleDescription(role.description || "");
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (role: Role) => {
    setSelectedRole(role);
    setIsDeleteDialogOpen(true);
  };

  const handlePermissionToggle = (permissionId: string, isChecked: boolean) => {
    if (!expandedRoleId || !rolePermissions) return;
    
    const currentPermissionIds = rolePermissions.map((p) => p.id);
    let newPermissionIds: string[];
    
    if (isChecked) {
      newPermissionIds = [...currentPermissionIds, permissionId];
    } else {
      newPermissionIds = currentPermissionIds.filter((id) => id !== permissionId);
    }
    
    updatePermissionsMutation.mutate({ roleId: expandedRoleId, permissionIds: newPermissionIds });
  };

  const isPermissionChecked = (permissionId: string): boolean => {
    return rolePermissions?.some((p) => p.id === permissionId) || false;
  };

  const groupedPermissions = permissions ? groupPermissionsByModule(permissions) : {};

  if (loadingRoles || loadingPermissions) {
    return (
      <div className="p-8 space-y-6 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6" />
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">
            Role Management
          </h1>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-role">
          <Plus className="h-4 w-4 mr-2" />
          Create Role
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Company Roles</CardTitle>
          <CardDescription>
            Manage roles and their permissions. System roles cannot be modified or deleted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {roles?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No roles defined yet. Create your first role to get started.
            </div>
          ) : (
            <Accordion
              type="single"
              collapsible
              value={expandedRoleId || undefined}
              onValueChange={(value) => setExpandedRoleId(value || null)}
            >
              {roles?.map((role) => (
                <AccordionItem key={role.id} value={role.id} data-testid={`accordion-role-${role.id}`}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-3 flex-1 text-left">
                      <span className="font-medium" data-testid={`text-role-name-${role.id}`}>
                        {role.name}
                      </span>
                      {role.isSystemRole && (
                        <Badge variant="secondary" className="gap-1">
                          <Lock className="h-3 w-3" />
                          System
                        </Badge>
                      )}
                      {role.isDefault && (
                        <Badge variant="outline">Default</Badge>
                      )}
                    </div>
                    {!role.isSystemRole && (
                      <div className="flex items-center gap-2 mr-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditDialog(role);
                          }}
                          data-testid={`button-edit-role-${role.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeleteDialog(role);
                          }}
                          data-testid={`button-delete-role-${role.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pt-4 space-y-6">
                      {role.description && (
                        <p className="text-sm text-muted-foreground">{role.description}</p>
                      )}
                      
                      <div className="space-y-4">
                        <h4 className="text-sm font-medium">Permissions</h4>
                        
                        {loadingRolePermissions && expandedRoleId === role.id ? (
                          <div className="space-y-2">
                            {[1, 2, 3].map((i) => (
                              <Skeleton key={i} className="h-8 w-full" />
                            ))}
                          </div>
                        ) : Object.keys(groupedPermissions).length === 0 ? (
                          <div className="text-sm text-muted-foreground">
                            No permissions defined in the system yet.
                          </div>
                        ) : (
                          <div className="grid gap-4">
                            {Object.entries(groupedPermissions).map(([module, perms]) => (
                              <div key={module} className="space-y-2">
                                <h5 className="text-sm font-medium text-muted-foreground">
                                  {formatModuleName(module)}
                                </h5>
                                <div className="grid gap-2 pl-4">
                                  {perms.map((perm) => (
                                    <div key={perm.id} className="flex items-center gap-3">
                                      <Checkbox
                                        id={`perm-${role.id}-${perm.id}`}
                                        checked={isPermissionChecked(perm.id)}
                                        onCheckedChange={(checked) =>
                                          handlePermissionToggle(perm.id, checked === true)
                                        }
                                        disabled={updatePermissionsMutation.isPending}
                                        data-testid={`checkbox-permission-${perm.id}`}
                                      />
                                      <Label
                                        htmlFor={`perm-${role.id}-${perm.id}`}
                                        className="flex items-center gap-2 text-sm cursor-pointer"
                                      >
                                        {formatActionName(perm.action)}
                                        {perm.isDangerGate && (
                                          <AlertTriangle className="h-3 w-3 text-amber-500" />
                                        )}
                                      </Label>
                                      {perm.description && (
                                        <span className="text-xs text-muted-foreground">
                                          - {perm.description}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Role</DialogTitle>
            <DialogDescription>
              Create a custom role for your team members.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="create-role-name">Role Name</Label>
              <Input
                id="create-role-name"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                placeholder="e.g., Field Supervisor"
                data-testid="input-create-role-name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="create-role-description">Description (optional)</Label>
              <Textarea
                id="create-role-description"
                value={roleDescription}
                onChange={(e) => setRoleDescription(e.target.value)}
                placeholder="Describe what this role is for..."
                data-testid="input-create-role-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateRole}
              disabled={createRoleMutation.isPending}
              data-testid="button-confirm-create-role"
            >
              {createRoleMutation.isPending ? "Creating..." : "Create Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Role</DialogTitle>
            <DialogDescription>
              Update the role name and description.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-role-name">Role Name</Label>
              <Input
                id="edit-role-name"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                data-testid="input-edit-role-name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-role-description">Description (optional)</Label>
              <Textarea
                id="edit-role-description"
                value={roleDescription}
                onChange={(e) => setRoleDescription(e.target.value)}
                data-testid="input-edit-role-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateRole}
              disabled={updateRoleMutation.isPending}
              data-testid="button-confirm-edit-role"
            >
              {updateRoleMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Role</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the role "{selectedRole?.name}"? This action cannot be undone.
              Users assigned to this role will lose their permissions.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteRole}
              disabled={deleteRoleMutation.isPending}
              data-testid="button-confirm-delete-role"
            >
              {deleteRoleMutation.isPending ? "Deleting..." : "Delete Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
