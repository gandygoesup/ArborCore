import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  GitBranch,
  Calendar,
  Users,
  MoreHorizontal,
  Plus,
  X,
  Briefcase,
  DollarSign,
  UserPlus,
  FileText,
  ClipboardList,
  Receipt,
  Settings,
  Calculator,
  Link2,
  Shield,
  LogOut,
  ScrollText,
  Bell,
  Search,
  TreeDeciduous,
  ChevronRight,
  Megaphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type User = {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  roles?: { id: string; name: string }[];
};

type NavItem = {
  icon: React.ElementType;
  label: string;
  path: string;
};

const primaryNav: NavItem[] = [
  { icon: GitBranch, label: "Pipeline", path: "/pipeline" },
  { icon: Calendar, label: "Calendar", path: "/calendar" },
  { icon: Briefcase, label: "Jobs", path: "/jobs" },

  // ✅ ADDED — Team Hub
  { icon: ClipboardList, label: "Team Hub", path: "/team" },

  { icon: Users, label: "Customers", path: "/customers" },
];

const moreMenuItems: NavItem[] = [
  { icon: DollarSign, label: "Money", path: "/money" },
  { icon: ScrollText, label: "Contracts", path: "/contracts" },
  { icon: Megaphone, label: "Marketing", path: "/marketing" },
];

const settingsItems: NavItem[] = [
  { icon: Settings, label: "Company", path: "/settings/company" },
  { icon: Calculator, label: "Cost Profile", path: "/settings/cost-profile" },
  { icon: Link2, label: "Quote Pages", path: "/settings/pricing-tools" },
  { icon: Megaphone, label: "Marketing", path: "/settings/marketing" },
  { icon: Users, label: "Team", path: "/settings/users" },
  { icon: Shield, label: "Roles", path: "/settings/roles" },
];

type QuickAction = {
  icon: React.ElementType;
  label: string;
  action: string;
  color: string;
};

const quickActions: QuickAction[] = [
  { icon: UserPlus, label: "New Lead", action: "lead", color: "bg-blue-500" },
  { icon: FileText, label: "New Estimate", action: "estimate", color: "bg-green-500" },
  { icon: ClipboardList, label: "New Job", action: "job", color: "bg-purple-500" },
  { icon: Receipt, label: "New Invoice", action: "invoice", color: "bg-orange-500" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [fabOpen, setFabOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { user } = useAuth() as { user: User | null };

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  const isActive = (path: string) => {
    if (path === "/pipeline")
      return (
        location === "/" ||
        location === "/pipeline" ||
        location.startsWith("/leads") ||
        location.startsWith("/estimates") ||
        location.startsWith("/pricing-tool")
      );
    if (path === "/customers") return location === "/customers" || location.startsWith("/customers/");
    if (path === "/calendar") return location === "/calendar" || location.startsWith("/scheduling");
    if (path === "/jobs") return location === "/jobs" || location.startsWith("/jobs/");

    // ✅ ADDED — Team Hub active state
    if (path === "/team") return location === "/team" || location.startsWith("/team/");

    if (path === "/money")
      return location === "/money" || location.startsWith("/billing") || location.startsWith("/invoices");
    if (path === "/marketing") return location === "/marketing" || location.startsWith("/marketing/");
    return location === path || location.startsWith(path + "/");
  };

  const handleQuickAction = (action: string) => {
    setFabOpen(false);
    switch (action) {
      case "lead":
        setLocation("/leads?create=true");
        break;
      case "estimate":
        setLocation("/estimates/new");
        break;
      case "job":
        setLocation("/calendar?create=job");
        break;
      case "invoice":
        setLocation("/money?create=invoice");
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

  const getPageTitle = () => {
    if (location === "/" || location === "/pipeline") return "Pipeline";
    if (location.startsWith("/calendar")) return "Calendar";
    if (location.startsWith("/customers")) return "Customers";
    if (location.startsWith("/jobs")) return "Jobs";

    // ✅ ADDED — Team Hub title
    if (location.startsWith("/team")) return "Team Hub";

    if (location.startsWith("/money")) return "Money";
    if (location.startsWith("/contracts")) return "Contracts";
    if (location.startsWith("/leads")) return "Leads";
    if (location.startsWith("/estimates")) return "Estimates";
    if (location.startsWith("/marketing")) return "Marketing";
    if (location.startsWith("/settings")) return "Settings";
    return "ArborCore";
  };

  return (
    <div className="flex flex-col h-screen w-full bg-background">
      {/* HEADER */}
      <header className="flex items-center justify-between h-14 px-4 border-b bg-background sticky top-0 z-50 gap-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2" data-testid="link-brand">
            <TreeDeciduous className="h-6 w-6 text-primary" />
            <span className="font-semibold hidden sm:inline">ArborCore</span>
          </Link>
          <span className="text-muted-foreground hidden sm:inline">/</span>
          <span className="font-medium text-sm sm:text-base" data-testid="text-page-title">
            {getPageTitle()}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="hidden md:flex" data-testid="button-search">
            <Search className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" data-testid="button-notifications">
            <Bell className="h-5 w-5" />
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" data-testid="button-user-menu">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user?.profileImageUrl || undefined} />
                  <AvatarFallback className="text-xs">{getInitials()}</AvatarFallback>
                </Avatar>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80">
              <SheetHeader>
                <SheetTitle>Account</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={user?.profileImageUrl || undefined} />
                    <AvatarFallback>{getInitials()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium" data-testid="text-user-name">
                      {user?.firstName && user?.lastName
                        ? `${user.firstName} ${user.lastName}`
                        : user?.email || "User"}
                    </p>
                    {user?.roles && user.roles.length > 0 && (
                      <p className="text-sm text-muted-foreground" data-testid="text-user-role">
                        {user.roles[0].name}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 mb-2">
                    Settings
                  </p>
                  {settingsItems.map((item) => (
                    <Link key={item.path} href={item.path}>
                      <Button
                        variant="ghost"
                        className="w-full justify-start gap-3"
                        data-testid={`menu-${item.label.toLowerCase().replace(" ", "-")}`}
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </Button>
                    </Link>
                  ))}
                </div>

                <Button
                  variant="outline"
                  className="w-full justify-start gap-3"
                  onClick={handleLogout}
                  data-testid="menu-logout"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="flex-1 overflow-auto pb-20 md:pb-0 md:pl-16">{children}</main>

      <AnimatePresence>
        {fabOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setFabOpen(false)}
          />
        )}
      </AnimatePresence>

      <div className="fixed bottom-20 right-4 z-50 md:bottom-6 md:right-6">
        <AnimatePresence>
          {fabOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="absolute bottom-16 right-0 flex flex-col gap-3 items-end"
            >
              {quickActions.map((action, index) => (
                <motion.div
                  key={action.action}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center gap-3"
                >
                  <span className="bg-card px-3 py-1.5 rounded-lg text-sm font-medium shadow-lg border">
                    {action.label}
                  </span>
                  <Button
                    size="icon"
                    className={`h-12 w-12 rounded-full shadow-lg ${action.color} hover:opacity-90`}
                    onClick={() => handleQuickAction(action.action)}
                    data-testid={`fab-${action.action}`}
                  >
                    <action.icon className="h-5 w-5 text-white" />
                  </Button>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div animate={{ rotate: fabOpen ? 45 : 0 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
          <Button size="icon" className="h-14 w-14 rounded-full shadow-lg" onClick={() => setFabOpen(!fabOpen)}>
            {fabOpen ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
          </Button>
        </motion.div>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-background border-t z-30 md:hidden safe-area-pb">
        <div className="flex items-center justify-around h-full px-2">
          {primaryNav.map((item) => {
            const active = isActive(item.path);
            return (
              <Link key={item.path} href={item.path}>
                <button
                  className={`flex flex-col items-center justify-center gap-1 min-w-[64px] py-2 px-3 rounded-lg transition-colors ${
                    active ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <item.icon className={`h-5 w-5 ${active ? "stroke-[2.5]" : ""}`} />
                  <span className="text-xs font-medium">{item.label}</span>
                </button>
              </Link>
            );
          })}

          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button className="flex flex-col items-center justify-center gap-1 min-w-[64px] py-2 px-3 rounded-lg text-muted-foreground">
                <MoreHorizontal className="h-5 w-5" />
                <span className="text-xs font-medium">More</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-auto max-h-[80vh] rounded-t-2xl">
              <SheetHeader>
                <SheetTitle>More</SheetTitle>
              </SheetHeader>
              <div className="mt-4 grid grid-cols-3 gap-4 pb-6">
                {moreMenuItems.map((item) => (
                  <Link key={item.path} href={item.path} onClick={() => setMoreOpen(false)}>
                    <button className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl bg-muted/50 hover-elevate">
                      <item.icon className="h-6 w-6" />
                      <span className="text-sm font-medium">{item.label}</span>
                    </button>
                  </Link>
                ))}
              </div>

              <div className="border-t pt-4 space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 mb-2">
                  Settings
                </p>
                {settingsItems.map((item) => (
                  <Link key={item.path} href={item.path} onClick={() => setMoreOpen(false)}>
                    <button className="flex items-center justify-between w-full p-3 rounded-lg hover-elevate">
                      <div className="flex items-center gap-3">
                        <item.icon className="h-5 w-5 text-muted-foreground" />
                        <span className="font-medium">{item.label}</span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </Link>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>

      <aside className="hidden md:flex fixed left-0 top-14 bottom-0 w-16 hover:w-56 bg-sidebar border-r z-30 flex-col transition-all duration-200 group overflow-hidden">
        <div className="flex-1 py-4">
          <nav className="space-y-1 px-2">
            {[...primaryNav, ...moreMenuItems].map((item) => {
              const active = isActive(item.path);
              return (
                <Link key={item.path} href={item.path}>
                  <button
                    className={`flex items-center gap-3 w-full p-3 rounded-lg transition-colors ${
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover-elevate"
                    }`}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    <span className="font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                      {item.label}
                    </span>
                  </button>
                </Link>
              );
            })}
          </nav>

          <div className="mt-6 px-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-2 opacity-0 group-hover:opacity-100 transition-opacity">
              Settings
            </p>
            <nav className="space-y-1">
              {settingsItems.map((item) => {
                const active = location === item.path;
                return (
                  <Link key={item.path} href={item.path}>
                    <button
                      className={`flex items-center gap-3 w-full p-3 rounded-lg transition-colors ${
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground hover-elevate"
                      }`}
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      <span className="font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                        {item.label}
                      </span>
                    </button>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        <div className="p-2 border-t">
          <Button variant="ghost" className="w-full justify-start gap-3 p-3" onClick={handleLogout}>
            <LogOut className="h-5 w-5 shrink-0" />
            <span className="font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
              Sign Out
            </span>
          </Button>
        </div>
      </aside>
    </div>
  );
}
