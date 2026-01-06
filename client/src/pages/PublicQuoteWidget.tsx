import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { DynamicField, getDefaultFieldValue } from "@/components/DynamicField";
import type { EstimateField } from "@shared/schema";
import { CheckCircle2, Phone, DollarSign, Loader2, TreeDeciduous, AlertCircle } from "lucide-react";

interface WidgetData {
  company: {
    name: string;
    logoUrl?: string | null;
    primaryPhone?: string | null;
  };
  fields: EstimateField[];
  config: {
    name: string;
    thankYouMessage: string;
  };
}

interface PricePreview {
  estimatedPriceLow: number;
  estimatedPriceHigh: number;
}

export default function PublicQuoteWidget() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug || "";
  
  const [inputs, setInputs] = useState<Record<string, any>>({});
  const [contactInfo, setContactInfo] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
  });
  const [step, setStep] = useState<"form" | "contact" | "success">("form");
  const [submissionResult, setSubmissionResult] = useState<{ priceLow: number; priceHigh: number; message: string } | null>(null);

  const { data: widgetData, isLoading, error } = useQuery<WidgetData>({
    queryKey: ["/api/public/quote-widget", slug, "fields"],
    enabled: !!slug,
  });

  useEffect(() => {
    if (widgetData?.fields && Object.keys(inputs).length === 0) {
      const defaults: Record<string, any> = {};
      widgetData.fields.forEach((field) => {
        defaults[field.fieldKey] = getDefaultFieldValue(field);
      });
      setInputs(defaults);
    }
  }, [widgetData, inputs]);

  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/public/quote-widget/${slug}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs, workItems: [] }),
      });
      if (!res.ok) throw new Error("Failed to calculate price");
      return res.json() as Promise<PricePreview>;
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/public/quote-widget/${slug}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...contactInfo,
          formData: inputs,
          workItems: [],
        }),
      });
      if (!res.ok) throw new Error("Failed to submit quote");
      return res.json();
    },
    onSuccess: (data) => {
      setSubmissionResult({
        priceLow: data.estimatedPriceLow,
        priceHigh: data.estimatedPriceHigh,
        message: data.message,
      });
      setStep("success");
    },
  });

  const handleGetQuote = () => {
    previewMutation.mutate();
    setStep("contact");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Skeleton className="h-16 w-16 rounded-full mx-auto mb-4" />
            <Skeleton className="h-6 w-48 mx-auto mb-2" />
            <Skeleton className="h-4 w-64 mx-auto" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !widgetData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950 dark:to-red-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <AlertCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
            <CardTitle>Quote Tool Not Found</CardTitle>
            <CardDescription>
              The quote tool you're looking for doesn't exist or has been disabled.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (step === "success" && submissionResult) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            {widgetData.company.logoUrl && (
              <img
                src={widgetData.company.logoUrl}
                alt={widgetData.company.name}
                className="h-12 mx-auto mb-4 object-contain"
              />
            )}
            <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto mb-4" />
            <CardTitle className="text-2xl">Quote Request Submitted</CardTitle>
            <CardDescription className="text-lg">{submissionResult.message}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-green-100 dark:bg-green-900/50 rounded-lg p-6">
              <p className="text-sm text-muted-foreground mb-2">Your Estimated Price Range</p>
              <p className="text-3xl font-bold text-green-700 dark:text-green-400" data-testid="text-final-price-range">
                ${submissionResult.priceLow.toLocaleString()} - ${submissionResult.priceHigh.toLocaleString()}
              </p>
            </div>
            {widgetData.company.primaryPhone && (
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <Phone className="h-4 w-4" />
                <span>Call us: {widgetData.company.primaryPhone}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "contact") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            {widgetData.company.logoUrl && (
              <img
                src={widgetData.company.logoUrl}
                alt={widgetData.company.name}
                className="h-12 mx-auto mb-4 object-contain"
              />
            )}
            <CardTitle className="text-2xl">Almost There!</CardTitle>
            <CardDescription>Enter your contact info to receive your free estimate</CardDescription>
          </CardHeader>
          <CardContent>
            {previewMutation.data && (
              <div className="bg-accent/50 rounded-lg p-4 mb-6 text-center">
                <p className="text-sm text-muted-foreground mb-1">Estimated Price Range</p>
                <p className="text-2xl font-bold" data-testid="text-preview-price-range">
                  <DollarSign className="inline h-5 w-5" />
                  {previewMutation.data.estimatedPriceLow.toLocaleString()} - ${previewMutation.data.estimatedPriceHigh.toLocaleString()}
                </p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    value={contactInfo.firstName}
                    onChange={(e) => setContactInfo({ ...contactInfo, firstName: e.target.value })}
                    required
                    data-testid="input-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={contactInfo.lastName}
                    onChange={(e) => setContactInfo({ ...contactInfo, lastName: e.target.value })}
                    data-testid="input-last-name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={contactInfo.email}
                  onChange={(e) => setContactInfo({ ...contactInfo, email: e.target.value })}
                  data-testid="input-email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={contactInfo.phone}
                  onChange={(e) => setContactInfo({ ...contactInfo, phone: e.target.value })}
                  data-testid="input-phone"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Service Address</Label>
                <Input
                  id="address"
                  value={contactInfo.address}
                  onChange={(e) => setContactInfo({ ...contactInfo, address: e.target.value })}
                  placeholder="123 Main St"
                  data-testid="input-address"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={contactInfo.city}
                    onChange={(e) => setContactInfo({ ...contactInfo, city: e.target.value })}
                    data-testid="input-city"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={contactInfo.state}
                    onChange={(e) => setContactInfo({ ...contactInfo, state: e.target.value })}
                    data-testid="input-state"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zipCode">ZIP</Label>
                  <Input
                    id="zipCode"
                    value={contactInfo.zipCode}
                    onChange={(e) => setContactInfo({ ...contactInfo, zipCode: e.target.value })}
                    data-testid="input-zip"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep("form")}
                  className="flex-1"
                  data-testid="button-back"
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={submitMutation.isPending || !contactInfo.firstName}
                  data-testid="button-submit-quote"
                >
                  {submitMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    "Get My Free Quote"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {widgetData.company.logoUrl ? (
            <img
              src={widgetData.company.logoUrl}
              alt={widgetData.company.name}
              className="h-12 mx-auto mb-4 object-contain"
            />
          ) : (
            <TreeDeciduous className="h-12 w-12 mx-auto mb-4 text-green-600" />
          )}
          <CardTitle className="text-2xl">{widgetData.config.name || "Get a Free Quote"}</CardTitle>
          <CardDescription>
            Answer a few questions to get an instant price estimate from {widgetData.company.name}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {widgetData.fields.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No quote fields have been configured yet.</p>
              <p className="text-sm mt-2">Please contact {widgetData.company.name} directly.</p>
            </div>
          ) : (
            <>
              {widgetData.fields.map((field) => (
                <DynamicField
                  key={field.id}
                  field={field}
                  value={inputs[field.fieldKey]}
                  onChange={(val) => setInputs((prev) => ({ ...prev, [field.fieldKey]: val }))}
                />
              ))}

              <Button
                onClick={handleGetQuote}
                className="w-full mt-6"
                size="lg"
                disabled={previewMutation.isPending}
                data-testid="button-get-quote"
              >
                {previewMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Calculating...
                  </>
                ) : (
                  "Get My Free Quote"
                )}
              </Button>

              {widgetData.company.primaryPhone && (
                <p className="text-center text-sm text-muted-foreground">
                  Or call us at{" "}
                  <a href={`tel:${widgetData.company.primaryPhone}`} className="underline">
                    {widgetData.company.primaryPhone}
                  </a>
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
