import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TreeDeciduous,
  Minus,
  Plus,
  AlertTriangle,
  Phone,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PricingToolConfig {
  basePrice: number;
  heightMultipliers: Record<string, number>;
  hazardMultiplier: number;
  stumpGrindingAddon: number;
  headline?: string;
  description?: string;
  thankYouMessage?: string;
  primaryColor?: string;
}

interface QuoteToolData {
  id: string;
  name: string;
  config: PricingToolConfig;
  company: {
    name: string;
    logoUrl?: string;
    primaryPhone?: string;
  };
}

interface FormData {
  treeHeight: string;
  treeCount: number;
  hasHazards: boolean;
  includeStumpGrinding: boolean;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
}

const initialFormData: FormData = {
  treeHeight: "medium",
  treeCount: 1,
  hasHazards: false,
  includeStumpGrinding: false,
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  zipCode: "",
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function PublicQuotePage() {
  const { toast } = useToast();
  const [, params] = useRoute("/quote/:slug");
  const slug = params?.slug;

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toolData, setToolData] = useState<QuoteToolData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [result, setResult] = useState<{
    priceLow: number;
    priceHigh: number;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!slug) return;

    const fetchTool = async () => {
      try {
        const response = await fetch(`/api/public/quote/${slug}`);
        if (!response.ok) {
          if (response.status === 404) {
            setError("This quote page was not found or is no longer active.");
          } else {
            setError("Unable to load quote form. Please try again later.");
          }
          return;
        }
        const data = await response.json();
        setToolData(data);
      } catch {
        setError("Unable to load quote form. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchTool();
  }, [slug]);

  const handleSubmit = async () => {
    if (!toolData || !slug) return;

    if (!formData.firstName) {
      toast({ title: "Please enter your name", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/public/quote/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          formData: {
            treeHeight: formData.treeHeight,
            treeCount: formData.treeCount,
            hasHazards: formData.hasHazards,
            includeStumpGrinding: formData.includeStumpGrinding,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to submit quote request");
      }

      const data = await response.json();
      setResult({
        priceLow: data.estimatedPriceLow,
        priceHigh: data.estimatedPriceHigh,
        message: data.message,
      });
      setStep(4);
    } catch {
      toast({
        title: "Error",
        description: "Unable to submit your quote request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white dark:from-green-950 dark:to-background flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardContent className="p-8 space-y-4">
            <Skeleton className="h-8 w-3/4 mx-auto" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <div className="pt-8 space-y-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !toolData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white dark:from-orange-950 dark:to-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="p-8">
            <div className="rounded-full bg-orange-100 dark:bg-orange-900 p-4 w-fit mx-auto mb-4">
              <AlertTriangle className="h-8 w-8 text-orange-600 dark:text-orange-400" />
            </div>
            <h1 className="text-xl font-semibold mb-2">Page Not Found</h1>
            <p className="text-muted-foreground mb-6">
              {error || "This quote page is not available."}
            </p>
            <Button variant="outline" onClick={() => window.history.back()}>
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const config = toolData.config;
  const primaryColor = config.primaryColor || "#16a34a";

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white dark:from-green-950 dark:to-background">
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {toolData.company.logoUrl ? (
              <img
                src={toolData.company.logoUrl}
                alt={toolData.company.name}
                className="h-8 w-auto"
              />
            ) : (
              <TreeDeciduous className="h-6 w-6" style={{ color: primaryColor }} />
            )}
            <span className="font-semibold">{toolData.company.name}</span>
          </div>
          {toolData.company.primaryPhone && (
            <a
              href={`tel:${toolData.company.primaryPhone}`}
              className="flex items-center gap-1.5 text-sm font-medium"
              style={{ color: primaryColor }}
              data-testid="link-phone"
            >
              <Phone className="h-4 w-4" />
              <span className="hidden md:inline">{toolData.company.primaryPhone}</span>
            </a>
          )}
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <div className="text-center mb-8">
                <h1 className="text-2xl md:text-3xl font-bold mb-2" data-testid="text-headline">
                  {config.headline || "Get Your Free Quote"}
                </h1>
                <p className="text-muted-foreground" data-testid="text-description">
                  {config.description || "Answer a few questions to get an instant estimate."}
                </p>
              </div>

              <Card className="rounded-2xl shadow-lg">
                <CardContent className="p-6 space-y-6">
                  <div className="space-y-3">
                    <Label className="text-base font-medium">Tree Height</Label>
                    <Select
                      value={formData.treeHeight}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, treeHeight: value }))}
                    >
                      <SelectTrigger className="h-12 rounded-lg" data-testid="select-tree-height">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">Small (Under 30ft)</SelectItem>
                        <SelectItem value="medium">Medium (30-50ft)</SelectItem>
                        <SelectItem value="large">Large (50-70ft)</SelectItem>
                        <SelectItem value="xl">Extra Large (70ft+)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-base font-medium">Number of Trees</Label>
                    <div className="flex items-center justify-center gap-4 p-4 rounded-lg bg-muted/50">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-11 w-11 rounded-lg"
                        onClick={() => setFormData(prev => ({ ...prev, treeCount: Math.max(1, prev.treeCount - 1) }))}
                        disabled={formData.treeCount <= 1}
                        data-testid="button-decrease-trees"
                      >
                        <Minus className="h-5 w-5" />
                      </Button>
                      <span className="text-3xl font-bold w-16 text-center" data-testid="text-tree-count">
                        {formData.treeCount}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-11 w-11 rounded-lg"
                        onClick={() => setFormData(prev => ({ ...prev, treeCount: prev.treeCount + 1 }))}
                        data-testid="button-increase-trees"
                      >
                        <Plus className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                    <div>
                      <Label className="text-base font-medium">Hazards Present?</Label>
                      <p className="text-sm text-muted-foreground">Power lines, buildings, etc.</p>
                    </div>
                    <Switch
                      checked={formData.hasHazards}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, hasHazards: checked }))}
                      data-testid="switch-hazards"
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                    <div>
                      <Label className="text-base font-medium">Include Stump Grinding?</Label>
                      <p className="text-sm text-muted-foreground">+{formatCurrency(config.stumpGrindingAddon || 150)}/stump</p>
                    </div>
                    <Switch
                      checked={formData.includeStumpGrinding}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, includeStumpGrinding: checked }))}
                      data-testid="switch-stump-grinding"
                    />
                  </div>

                  <Button
                    className="w-full h-12 rounded-lg text-base"
                    style={{ backgroundColor: primaryColor }}
                    onClick={() => setStep(2)}
                    data-testid="button-next-step1"
                  >
                    Continue
                    <ArrowRight className="h-5 w-5 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <div className="text-center mb-8">
                <h2 className="text-xl font-bold mb-2">Your Contact Info</h2>
                <p className="text-muted-foreground">So we can send you a detailed quote.</p>
              </div>

              <Card className="rounded-2xl shadow-lg">
                <CardContent className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name *</Label>
                      <Input
                        id="firstName"
                        value={formData.firstName}
                        onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                        className="h-12 rounded-lg"
                        required
                        data-testid="input-first-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input
                        id="lastName"
                        value={formData.lastName}
                        onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                        className="h-12 rounded-lg"
                        data-testid="input-last-name"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                      className="h-12 rounded-lg"
                      placeholder="(555) 123-4567"
                      data-testid="input-phone"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      className="h-12 rounded-lg"
                      placeholder="you@example.com"
                      data-testid="input-email"
                    />
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="outline"
                      className="h-12 rounded-lg"
                      onClick={() => setStep(1)}
                      data-testid="button-back-step2"
                    >
                      <ArrowLeft className="h-5 w-5 mr-2" />
                      Back
                    </Button>
                    <Button
                      className="flex-1 h-12 rounded-lg text-base"
                      style={{ backgroundColor: primaryColor }}
                      onClick={() => setStep(3)}
                      disabled={!formData.firstName}
                      data-testid="button-next-step2"
                    >
                      Continue
                      <ArrowRight className="h-5 w-5 ml-2" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <div className="text-center mb-8">
                <h2 className="text-xl font-bold mb-2">Property Address</h2>
                <p className="text-muted-foreground">Where is the work needed? (Optional)</p>
              </div>

              <Card className="rounded-2xl shadow-lg">
                <CardContent className="p-6 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="address">Street Address</Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                      className="h-12 rounded-lg"
                      placeholder="123 Main Street"
                      data-testid="input-address"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        value={formData.city}
                        onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                        className="h-12 rounded-lg"
                        data-testid="input-city"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="state">State</Label>
                      <Input
                        id="state"
                        value={formData.state}
                        onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))}
                        className="h-12 rounded-lg"
                        data-testid="input-state"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="zipCode">ZIP Code</Label>
                    <Input
                      id="zipCode"
                      value={formData.zipCode}
                      onChange={(e) => setFormData(prev => ({ ...prev, zipCode: e.target.value }))}
                      className="h-12 rounded-lg w-32"
                      data-testid="input-zip"
                    />
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="outline"
                      className="h-12 rounded-lg"
                      onClick={() => setStep(2)}
                      data-testid="button-back-step3"
                    >
                      <ArrowLeft className="h-5 w-5 mr-2" />
                      Back
                    </Button>
                    <Button
                      className="flex-1 h-12 rounded-lg text-base"
                      style={{ backgroundColor: primaryColor }}
                      onClick={handleSubmit}
                      disabled={isSubmitting}
                      data-testid="button-submit"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                          Getting Quote...
                        </>
                      ) : (
                        <>
                          Get My Quote
                          <ArrowRight className="h-5 w-5 ml-2" />
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 4 && result && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="text-center"
            >
              <div className="mb-8">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
                  className="rounded-full p-4 w-fit mx-auto mb-4"
                  style={{ backgroundColor: `${primaryColor}20` }}
                >
                  <CheckCircle2 className="h-12 w-12" style={{ color: primaryColor }} />
                </motion.div>
                <h2 className="text-2xl font-bold mb-2" data-testid="text-success-title">Your Estimated Quote</h2>
              </div>

              <Card className="rounded-2xl shadow-lg mb-6">
                <CardContent className="p-8">
                  <div className="mb-6">
                    <p className="text-sm text-muted-foreground mb-2">Estimated Range</p>
                    <p className="text-4xl font-bold" data-testid="text-price-range">
                      {formatCurrency(result.priceLow)} - {formatCurrency(result.priceHigh)}
                    </p>
                  </div>
                  <p className="text-muted-foreground" data-testid="text-thank-you">
                    {result.message}
                  </p>
                </CardContent>
              </Card>

              {toolData.company.primaryPhone && (
                <Button
                  className="h-12 rounded-lg px-8"
                  style={{ backgroundColor: primaryColor }}
                  asChild
                >
                  <a href={`tel:${toolData.company.primaryPhone}`} data-testid="button-call-now">
                    <Phone className="h-5 w-5 mr-2" />
                    Call Now: {toolData.company.primaryPhone}
                  </a>
                </Button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {step < 4 && (
          <div className="flex justify-center gap-2 mt-8">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-2 rounded-full transition-all ${
                  s === step ? "w-8 bg-green-600" : s < step ? "w-2 bg-green-400" : "w-2 bg-gray-300"
                }`}
                style={s <= step ? { backgroundColor: primaryColor } : undefined}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="py-6 text-center text-sm text-muted-foreground">
        <p>Powered by {toolData.company.name}</p>
      </footer>
    </div>
  );
}
