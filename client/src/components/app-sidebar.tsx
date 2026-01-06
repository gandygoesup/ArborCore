import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  TreeDeciduous,
  GitBranch,
  Calendar,
  Briefcase,
  DollarSign,
  Settings,
  Calculator,
  LogOut,
  ChevronUp,
  Plus,
  UserPlus,
  FileText,
  ClipboardList,
  Receipt,
  CreditCard,
  Users,
  Contact,
  ScrollText,
  Shield,
  Link2,
} from "lucide-react";

type WorkspaceItem = {
  title: string;
  url: string;
  icon: typeof GitBranch;
  allowedRoles: string[];
};

const workspaces: WorkspaceItem[] = [
  { 
    title: "Pipeline", 
    url: "/pipeline", 
    icon: GitBranch,
    allowedRoles: ["Admin", "Estimator", "Accountant"]
  },
  { 
    title: "Customers", 
    url: "/customers", 
    icon: Contact,
    allowedRoles: ["Admin", "Estimator", "Accountant"]
  },
  { 
    title: "Calendar", 
    url: "/calendar", 
    icon: Calendar,
    allowedRoles: ["Admin", "Estimator", "Accountant", "Crew"]
  },
  { 
    title: "Jobs", 
    url: "/jobs", 
    icon: Briefcase,
    allowedRoles: ["Admin", "Estimator", "Accountant", "Crew"]
  },
  { 
    title: "Money", 
    url: "/money", 
    icon: DollarSign,
    allowedRoles: ["Admin", "Accountant"]
  },
  { 
    title: "Contracts", 
    url: "/contracts", 
    icon: ScrollText,
    allowedRoles: ["Admin", "Estimator", "Accountant"]
  },
];

type CommandAction = {
  title: string;
  icon: typeof UserPlus;
  action: string;
  allowedRoles: string[];
};

const commandActions: CommandAction[] = [
  { title: "New Lead", icon: UserPlus, action: "lead", allowedRoles: ["Admin", "Estimator"] },
  { title: "Pricing Tool", icon: Calculator, action: "pricing", allowedRoles: ["Admin", "Estimator"] },
  { title: "New Estimate", icon: FileText, action: "estimate", allowedRoles: ["Admin", "Estimator"] },
  { title: "Schedule Job", icon: ClipboardList, action: "job", allowedRoles: ["Admin", "Estimator"] },
  { title: "Create Invoice", icon: Receipt, action: "invoice", allowedRoles: ["Admin", "Accountant"] },
  { title: "Record Payment", icon: CreditCard, action: "payment", allowedRoles: ["Admin", "Accountant"] },
];

type User = {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  roles?: { id: string; name: string }[];
};

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth() as { user: User | null };
  const { isMobile, setOpenMobile } = useSidebar();

  const userRoles = user?.roles?.map((r) => r.name) || [];
  const hasRole = (allowedRoles: string[]) => {
    if (allowedRoles.length === 0) return true;
    return allowedRoles.some(role => userRoles.includes(role));
  };

  const visibleWorkspaces = workspaces.filter(ws => hasRole(ws.allowedRoles));
  const visibleCommands = commandActions.filter(cmd => hasRole(cmd.allowedRoles));

  const closeMobileMenu = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const handleLogout = () => {
    closeMobileMenu();
    window.location.href = "/api/logout";
  };

  const handleCommand = (action: string) => {
    closeMobileMenu();
    switch (action) {
      case "lead":
        setLocation("/pipeline?create=lead");
        break;
      case "pricing":
        setLocation("/pricing-tool");
        break;
      case "estimate":
        setLocation("/pipeline?create=estimate");
        break;
      case "job":
        setLocation("/calendar?create=job");
        break;
      case "invoice":
        setLocation("/money?create=invoice");
        break;
      case "payment":
        setLocation("/money?create=payment");
        break;
    }
  };

  const getInitials = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return "U";
  };

  const isActive = (url: string) => {
    if (url === "/pipeline") {
      return location === "/pipeline" || location.startsWith("/leads") || location.startsWith("/estimates");
    }
    if (url === "/customers") {
      return location === "/customers" || location.startsWith("/customers/");
    }
    if (url === "/calendar") {
      return location === "/calendar" || location.startsWith("/scheduling");
    }
    if (url === "/jobs") {
      return location === "/jobs" || location.startsWith("/jobs/");
    }
    if (url === "/money") {
      return location === "/money" || location.startsWith("/billing") || location.startsWith("/invoices");
    }
    if (url === "/contracts") {
      return location === "/contracts" || location.startsWith("/contracts/");
    }
    return location === url;
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/" className="flex items-center gap-2" data-testid="link-brand">
          <TreeDeciduous className="h-6 w-6 text-primary" />
          <span className="font-semibold">ArborCore</span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <div className="mb-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                className="w-full justify-start gap-2" 
                data-testid="button-command-bar"
              >
                <Plus className="h-4 w-4" />
                <span>Create...</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {visibleCommands.map((cmd) => (
                <DropdownMenuItem 
                  key={cmd.action}
                  onClick={() => handleCommand(cmd.action)}
                  data-testid={`command-${cmd.action}`}
                >
                  <cmd.icon className="mr-2 h-4 w-4" />
                  {cmd.title}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <SidebarMenu>
          {visibleWorkspaces.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild isActive={isActive(item.url)}>
                <Link 
                  href={item.url} 
                  onClick={closeMobileMenu}
                  data-testid={`nav-${item.title.toLowerCase()}`}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-start gap-2 h-auto py-2" data-testid="button-user-menu">
              <Avatar className="h-6 w-6">
                <AvatarImage src={user?.profileImageUrl || undefined} />
                <AvatarFallback className="text-xs">{getInitials()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left min-w-0">
                <span className="text-sm truncate block" data-testid="text-user-name">
                  {user?.firstName && user?.lastName 
                    ? `${user.firstName} ${user.lastName}` 
                    : user?.email || 'User'}
                </span>
                {user?.roles && user.roles.length > 0 && (
                  <span className="text-xs text-muted-foreground" data-testid="text-user-role">
                    {user.roles[0].name}
                  </span>
                )}
              </div>
              <ChevronUp className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {hasRole(["Admin"]) && (
              <>
                <DropdownMenuItem asChild>
                  <Link href="/settings/users" onClick={closeMobileMenu} data-testid="menu-user-management">
                    <Users className="mr-2 h-4 w-4" />
                    Team Management
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings/roles" onClick={closeMobileMenu} data-testid="menu-role-management">
                    <Shield className="mr-2 h-4 w-4" />
                    Roles & Permissions
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings/cost-profile" onClick={closeMobileMenu} data-testid="menu-cost-profile">
                    <Calculator className="mr-2 h-4 w-4" />
                    Cost Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings/estimates" onClick={closeMobileMenu} data-testid="menu-estimate-settings">
                    <ClipboardList className="mr-2 h-4 w-4" />
                    Estimate Configuration
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings/pricing-tools" onClick={closeMobileMenu} data-testid="menu-pricing-tools">
                    <Link2 className="mr-2 h-4 w-4" />
                    Quote Landing Pages
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings/company" onClick={closeMobileMenu} data-testid="menu-company-settings">
                    <Settings className="mr-2 h-4 w-4" />
                    Company Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={handleLogout} data-testid="menu-logout">
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
