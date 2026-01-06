import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2, Clock, CreditCard, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import type { Company, CompanySettings } from "@shared/schema";

const timezones = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Anchorage", label: "Alaska Time (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HT)" },
];

export default function CompanySettingsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const companyId = user?.companyId;

  const [companyData, setCompanyData] = useState({
    name: "",
    timezone: "America/New_York",
    primaryAddress: "",
    primaryPhone: "",
    primaryEmail: "",
    defaultTaxRate: "0.0000",
  });

  const [settingsData, setSettingsData] = useState({
    businessHoursStart: "08:00",
    businessHoursEnd: "17:00",
    workDaysPerWeek: 5,
    depositPolicy: "required",
    lateFeePercentage: "0.00",
    autoRemindersEnabled: true,
  });

  const { data: company, isLoading: companyLoading } = useQuery<Company>({
    queryKey: ['/api/companies', companyId],
    enabled: !!companyId,
  });

  const { data: settings, isLoading: settingsLoading } = useQuery<CompanySettings>({
    queryKey: ['/api/company-settings'],
    enabled: !!companyId,
  });

  useEffect(() => {
    if (company) {
      setCompanyData({
        name: company.name || "",
        timezone: company.timezone || "America/New_York",
        primaryAddress: company.primaryAddress || "",
        primaryPhone: company.primaryPhone || "",
        primaryEmail: company.primaryEmail || "",
        defaultTaxRate: company.defaultTaxRate || "0.0000",
      });
    }
  }, [company]);

  useEffect(() => {
    if (settings) {
      setSettingsData({
        businessHoursStart: settings.businessHoursStart || "08:00",
        businessHoursEnd: settings.businessHoursEnd || "17:00",
        workDaysPerWeek: settings.workDaysPerWeek || 5,
        depositPolicy: settings.depositPolicy || "required",
        lateFeePercentage: settings.lateFeePercentage || "0.00",
        autoRemindersEnabled: settings.autoRemindersEnabled ?? true,
      });
    }
  }, [settings]);

  const updateCompanyMutation = useMutation({
    mutationFn: async (data: typeof companyData) => {
      const response = await apiRequest("PATCH", `/api/companies/${companyId}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/companies', companyId] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      toast({ title: "Company updated", description: "Your company information has been saved." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: typeof settingsData) => {
      const response = await apiRequest("PUT", "/api/company-settings", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company-settings'] });
      toast({ title: "Settings updated", description: "Your company settings have been saved." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSaveCompany = () => {
    updateCompanyMutation.mutate(companyData);
  };

  const handleSaveSettings = () => {
    updateSettingsMutation.mutate(settingsData);
  };

  const isLoading = companyLoading || settingsLoading;

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-semibold" data-testid="text-page-title">Company Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your company profile and preferences</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold">Company Information</CardTitle>
            </div>
            <CardDescription>Basic details about your business</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Company Name</Label>
              <Input
                id="name"
                value={companyData.name}
                onChange={(e) => setCompanyData({ ...companyData, name: e.target.value })}
                data-testid="input-company-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone">Time Zone</Label>
              <Select
                value={companyData.timezone}
                onValueChange={(value) => setCompanyData({ ...companyData, timezone: value })}
              >
                <SelectTrigger data-testid="select-timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timezones.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Primary Address</Label>
              <Input
                id="address"
                value={companyData.primaryAddress}
                onChange={(e) => setCompanyData({ ...companyData, primaryAddress: e.target.value })}
                placeholder="123 Main St, City, State 12345"
                data-testid="input-address"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={companyData.primaryPhone}
                  onChange={(e) => setCompanyData({ ...companyData, primaryPhone: e.target.value })}
                  placeholder="(555) 123-4567"
                  data-testid="input-phone"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={companyData.primaryEmail}
                  onChange={(e) => setCompanyData({ ...companyData, primaryEmail: e.target.value })}
                  placeholder="info@company.com"
                  data-testid="input-email"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="taxRate">Default Tax Rate (%)</Label>
              <Input
                id="taxRate"
                type="number"
                step="0.01"
                value={parseFloat(companyData.defaultTaxRate) * 100}
                onChange={(e) => setCompanyData({
                  ...companyData,
                  defaultTaxRate: (parseFloat(e.target.value) / 100).toFixed(4)
                })}
                placeholder="8.25"
                data-testid="input-tax-rate"
              />
            </div>

            <Button
              onClick={handleSaveCompany}
              disabled={updateCompanyMutation.isPending}
              className="w-full"
              data-testid="button-save-company"
            >
              <Save className="h-4 w-4 mr-2" />
              {updateCompanyMutation.isPending ? "Saving..." : "Save Company Info"}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <CardTitle className="text-base font-semibold">Business Hours</CardTitle>
              </div>
              <CardDescription>Set your operating schedule</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startTime">Start Time</Label>
                  <Input
                    id="startTime"
                    type="time"
                    value={settingsData.businessHoursStart}
                    onChange={(e) => setSettingsData({ ...settingsData, businessHoursStart: e.target.value })}
                    data-testid="input-start-time"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endTime">End Time</Label>
                  <Input
                    id="endTime"
                    type="time"
                    value={settingsData.businessHoursEnd}
                    onChange={(e) => setSettingsData({ ...settingsData, businessHoursEnd: e.target.value })}
                    data-testid="input-end-time"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="workDays">Work Days Per Week</Label>
                <Select
                  value={settingsData.workDaysPerWeek.toString()}
                  onValueChange={(value) => setSettingsData({ ...settingsData, workDaysPerWeek: parseInt(value) })}
                >
                  <SelectTrigger data-testid="select-work-days">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 days (Mon-Fri)</SelectItem>
                    <SelectItem value="6">6 days (Mon-Sat)</SelectItem>
                    <SelectItem value="7">7 days (All week)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                <CardTitle className="text-base font-semibold">Billing Preferences</CardTitle>
              </div>
              <CardDescription>Configure payment and invoicing options</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="depositPolicy">Deposit Policy</Label>
                <Select
                  value={settingsData.depositPolicy}
                  onValueChange={(value) => setSettingsData({ ...settingsData, depositPolicy: value })}
                >
                  <SelectTrigger data-testid="select-deposit-policy">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No deposit required</SelectItem>
                    <SelectItem value="optional">Optional deposit</SelectItem>
                    <SelectItem value="required">Deposit required</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="lateFee">Late Fee (%)</Label>
                <Input
                  id="lateFee"
                  type="number"
                  step="0.5"
                  value={settingsData.lateFeePercentage}
                  onChange={(e) => setSettingsData({ ...settingsData, lateFeePercentage: e.target.value })}
                  placeholder="1.5"
                  data-testid="input-late-fee"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="reminders">Automatic Reminders</Label>
                  <p className="text-xs text-muted-foreground">Send payment reminders to customers</p>
                </div>
                <Switch
                  id="reminders"
                  checked={settingsData.autoRemindersEnabled}
                  onCheckedChange={(checked) => setSettingsData({ ...settingsData, autoRemindersEnabled: checked })}
                  data-testid="switch-reminders"
                />
              </div>

              <Button
                onClick={handleSaveSettings}
                disabled={updateSettingsMutation.isPending}
                className="w-full"
                data-testid="button-save-settings"
              >
                <Save className="h-4 w-4 mr-2" />
                {updateSettingsMutation.isPending ? "Saving..." : "Save Settings"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
