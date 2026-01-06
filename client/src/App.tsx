import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";

import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Onboarding from "@/pages/Onboarding";
import Pipeline from "@/pages/Pipeline";
import Jobs from "@/pages/Jobs";
import Money from "@/pages/Money";
import Customers from "@/pages/Customers";
import Leads from "@/pages/Leads";
import Estimates from "@/pages/Estimates";
import EstimateBuilder from "@/pages/EstimateBuilder";
import NewEstimate from "@/pages/NewEstimate";
import PricingTool from "@/pages/PricingTool";
import CostProfile from "@/pages/CostProfile";
import CompanySettings from "@/pages/CompanySettings";
import PricingToolsSettings from "@/pages/PricingToolsSettings";
import Scheduling from "@/pages/Scheduling";
import Billing from "@/pages/Billing";
import InvoiceDetail from "@/pages/InvoiceDetail";
import Proposal from "@/pages/Proposal";
import InvoicePortal from "@/pages/InvoicePortal";
import ContractPortal from "@/pages/ContractPortal";
import PaymentPlanPortal from "@/pages/PaymentPlanPortal";
import PublicQuotePage from "@/pages/PublicQuotePage";
import Contracts from "@/pages/Contracts";
import ContractDetail from "@/pages/ContractDetail";
import UserManagement from "@/pages/UserManagement";
import RoleManagement from "@/pages/RoleManagement";
import Marketing from "@/pages/Marketing";
import SettingsMarketing from "@/pages/SettingsMarketing";
import PublicMarketingPage from "@/pages/PublicMarketingPage";
import EstimateSettings from "@/pages/EstimateSettings";
import PublicQuoteWidget from "@/pages/PublicQuoteWidget";

// ✅ NEW IMPORTS
import TeamHub from "@/pages/TeamHub";
import JobTruthSheet from "@/pages/JobTruthSheet";

type User = {
  id: string;
  companyId?: string;
};

function Router() {
  const { user, isLoading, isAuthenticated } = useAuth() as {
    user: User | null;
    isLoading: boolean;
    isAuthenticated: boolean;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="space-y-4 w-64">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Landing />;
  }

  if (!user?.companyId) {
    return <Onboarding />;
  }

  return (
    <AppShell>
      <Switch>
        <Route path="/" component={Pipeline} />
        <Route path="/pipeline" component={Pipeline} />
        <Route path="/calendar" component={Scheduling} />
        <Route path="/jobs" component={Jobs} />
        <Route path="/money" component={Money} />
        <Route path="/customers" component={Customers} />
        <Route path="/leads" component={Leads} />
        <Route path="/estimates" component={Estimates} />
        <Route path="/pricing-tool" component={PricingTool} />
        <Route path="/estimates/new" component={NewEstimate} />
        <Route path="/estimates/:id" component={EstimateBuilder} />
        <Route path="/scheduling" component={Scheduling} />
        <Route path="/billing" component={Billing} />
        <Route path="/invoices/:id" component={InvoiceDetail} />
        <Route path="/contracts" component={Contracts} />
        <Route path="/contracts/:id" component={ContractDetail} />

        {/* ✅ TEAM HUB ROUTES */}
        <Route path="/team" component={TeamHub} />
        <Route path="/team/jobs/:jobId" component={JobTruthSheet} />

        <Route path="/settings/cost-profile" component={CostProfile} />
        <Route path="/settings/company" component={CompanySettings} />
        <Route path="/settings/pricing-tools" component={PricingToolsSettings} />
        <Route path="/settings/users" component={UserManagement} />
        <Route path="/settings/roles" component={RoleManagement} />
        <Route path="/settings/marketing" component={SettingsMarketing} />
        <Route path="/settings/estimates" component={EstimateSettings} />
        <Route path="/marketing" component={Marketing} />

        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Switch>
          <Route path="/proposal/:token" component={Proposal} />
          <Route path="/portal/invoices/:token" component={InvoicePortal} />
          <Route path="/contracts/:token/sign" component={ContractPortal} />
          <Route path="/payment-plan/:token" component={PaymentPlanPortal} />
          <Route path="/quote/:slug" component={PublicQuotePage} />
          <Route path="/quote-widget/:slug" component={PublicQuoteWidget} />
          <Route path="/m/:token" component={PublicMarketingPage} />
          <Route>
            <Router />
          </Route>
        </Switch>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
