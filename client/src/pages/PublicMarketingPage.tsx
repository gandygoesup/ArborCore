import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, TreeDeciduous, Phone, Mail, MapPin, ArrowRight } from "lucide-react";

interface MarketingPageData {
  id: string;
  title: string;
  headline: string | null;
  description: string | null;
  ctaText: string | null;
  thankYouMessage: string | null;
  heroImageUrl: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  inputFields: Array<{
    name: string;
    label: string;
    type: string;
    required: boolean;
  }>;
  company: {
    name: string;
    logoUrl: string | null;
    primaryPhone: string | null;
    primaryEmail: string | null;
    primaryAddress: string | null;
  };
}

export default function PublicMarketingPage() {
  const { token } = useParams<{ token: string }>();
  const [pageData, setPageData] = useState<MarketingPageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    const fetchPage = async () => {
      try {
        const response = await fetch(`/api/public/marketing/${token}`);
        if (!response.ok) {
          if (response.status === 404) {
            setError("This page is no longer available.");
          } else {
            setError("Unable to load this page.");
          }
          return;
        }
        const data = await response.json();
        setPageData(data);
        const initialFormData: Record<string, string> = {};
        if (data.inputFields) {
          data.inputFields.forEach((field: { name: string }) => {
            initialFormData[field.name] = "";
          });
        }
        setFormData(initialFormData);
      } catch (err) {
        setError("Unable to load this page.");
      } finally {
        setIsLoading(false);
      }
    };

    if (token) {
      fetchPage();
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pageData) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/public/marketing/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      
      if (response.ok) {
        setIsSubmitted(true);
      } else {
        const errorData = await response.json();
        alert(errorData.message || "Something went wrong. Please try again.");
      }
    } catch (err) {
      alert("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (fieldName: string, value: string) => {
    setFormData(prev => ({ ...prev, [fieldName]: value }));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full space-y-6">
          <Skeleton className="h-12 w-3/4 mx-auto" />
          <Skeleton className="h-6 w-1/2 mx-auto" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8">
            <TreeDeciduous className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h1 className="text-xl font-semibold mb-2">Page Not Found</h1>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!pageData) return null;

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-12 pb-12">
            <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="h-10 w-10 text-green-500" />
            </div>
            <h1 className="text-2xl font-semibold mb-4">Thank You!</h1>
            <p className="text-muted-foreground">
              {pageData.thankYouMessage || "We've received your request and will be in touch shortly."}
            </p>
            {pageData.company.primaryPhone && (
              <div className="mt-8 pt-6 border-t">
                <p className="text-sm text-muted-foreground mb-2">Need to reach us sooner?</p>
                <a 
                  href={`tel:${pageData.company.primaryPhone}`}
                  className="inline-flex items-center gap-2 text-primary font-medium"
                >
                  <Phone className="h-4 w-4" />
                  {pageData.company.primaryPhone}
                </a>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const primaryColor = pageData.primaryColor || "#16a34a";

  return (
    <div className="min-h-screen bg-background">
      <div 
        className="w-full py-16 px-4"
        style={{ background: `linear-gradient(135deg, ${primaryColor}15, ${primaryColor}05)` }}
      >
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex items-center justify-center gap-3 mb-6">
            {pageData.company.logoUrl ? (
              <img 
                src={pageData.company.logoUrl} 
                alt={pageData.company.name} 
                className="h-10 w-auto"
              />
            ) : (
              <TreeDeciduous className="h-10 w-10" style={{ color: primaryColor }} />
            )}
            <span className="text-xl font-semibold">{pageData.company.name}</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-4">
            {pageData.headline || pageData.title}
          </h1>
          {pageData.description && (
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {pageData.description}
            </p>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-8 -mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Request Your Free Estimate</CardTitle>
            <CardDescription>
              Fill out the form below and we'll get back to you within 24 hours.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {pageData.inputFields?.map((field) => (
                <div key={field.name} className="space-y-2">
                  <Label htmlFor={field.name}>
                    {field.label}
                    {field.required && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  {field.type === "textarea" ? (
                    <Textarea
                      id={field.name}
                      value={formData[field.name] || ""}
                      onChange={(e) => handleInputChange(field.name, e.target.value)}
                      required={field.required}
                      data-testid={`input-${field.name}`}
                    />
                  ) : (
                    <Input
                      id={field.name}
                      type={field.type || "text"}
                      value={formData[field.name] || ""}
                      onChange={(e) => handleInputChange(field.name, e.target.value)}
                      required={field.required}
                      data-testid={`input-${field.name}`}
                    />
                  )}
                </div>
              ))}
              <Button 
                type="submit" 
                className="w-full"
                size="lg"
                disabled={isSubmitting}
                style={{ backgroundColor: primaryColor }}
                data-testid="button-submit-form"
              >
                {isSubmitting ? "Submitting..." : (pageData.ctaText || "Get My Free Estimate")}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="mt-8 text-center text-sm text-muted-foreground space-y-2">
          {pageData.company.primaryPhone && (
            <a href={`tel:${pageData.company.primaryPhone}`} className="flex items-center justify-center gap-2 hover:text-foreground">
              <Phone className="h-4 w-4" />
              {pageData.company.primaryPhone}
            </a>
          )}
          {pageData.company.primaryEmail && (
            <a href={`mailto:${pageData.company.primaryEmail}`} className="flex items-center justify-center gap-2 hover:text-foreground">
              <Mail className="h-4 w-4" />
              {pageData.company.primaryEmail}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
