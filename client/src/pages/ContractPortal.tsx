import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SignaturePad } from "@/components/SignaturePad";
import {
  AlertCircle,
  FileText,
  CheckCircle2,
  PenTool,
  Clock,
  Type,
  Pencil,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; message: string }> = {
  draft: { label: "DRAFT", variant: "secondary", message: "This contract is not yet ready for signing." },
  sent: { label: "AWAITING SIGNATURE", variant: "default", message: "Please review and sign this contract." },
  signed: { label: "SIGNED", variant: "default", message: "This contract has been signed. Thank you!" },
  expired: { label: "EXPIRED", variant: "outline", message: "This contract has expired." },
  voided: { label: "VOIDED", variant: "destructive", message: "This contract has been voided." },
};

interface ContractData {
  id: string;
  contractNumber: string;
  status: string;
  headerContent: string | null;
  workItemsContent: string | null;
  termsContent: string | null;
  footerContent: string | null;
  estimateSnapshot: any;
  signedAt: string | null;
  signerName: string | null;
  signerInitials: string | null;
  signatureData: string | null;
  createdAt: string;
}

interface PortalContractResponse {
  contract: ContractData;
  customer: {
    name: string;
    email: string | null;
  } | null;
  company: {
    name: string;
  } | null;
  isSigned: boolean;
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
    month: "long",
    day: "numeric",
  });
}

export default function ContractPortal() {
  const [, params] = useRoute("/contracts/:token/sign");
  const token = params?.token;
  const { toast } = useToast();

  const [signerName, setSignerName] = useState("");
  const [signerInitials, setSignerInitials] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [signatureType, setSignatureType] = useState<"typed" | "drawn">("drawn");
  const [drawnSignature, setDrawnSignature] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery<PortalContractResponse>({
    queryKey: ['/api/portal/contracts', token],
    queryFn: async () => {
      const res = await fetch(`/api/portal/contracts/${token}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load contract');
      return res.json();
    },
    enabled: !!token,
  });

  const signMutation = useMutation({
    mutationFn: async () => {
      const signatureData = signatureType === "drawn" ? drawnSignature : null;
      const res = await apiRequest("POST", `/api/portal/contracts/${token}/sign`, {
        signerName,
        signerInitials,
        signatureData,
        signatureType,
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to sign contract");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Contract signed successfully!" });
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to sign contract",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSign = () => {
    if (!signerName.trim()) {
      toast({ title: "Please enter your full name", variant: "destructive" });
      return;
    }
    if (signatureType === "typed" && !signerInitials.trim()) {
      toast({ title: "Please enter your initials", variant: "destructive" });
      return;
    }
    if (signatureType === "drawn" && !drawnSignature) {
      toast({ title: "Please draw your signature", variant: "destructive" });
      return;
    }
    if (!agreedToTerms) {
      toast({ title: "Please agree to the terms and conditions", variant: "destructive" });
      return;
    }
    signMutation.mutate();
  };

  const isSignValid = signerName.trim() && agreedToTerms && 
    ((signatureType === "typed" && signerInitials.trim()) || 
     (signatureType === "drawn" && drawnSignature));

  const contract = data?.contract;
  const customer = data?.customer;
  const company = data?.company;
  const isSigned = data?.isSigned;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30 py-12 px-4">
        <div className="max-w-3xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Contract Not Found</h2>
            <p className="text-muted-foreground">
              This contract link may have expired or is invalid. Please contact the business for a new link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const config = statusConfig[contract.status] || statusConfig.sent;
  const canSign = contract.status === "sent" && !isSigned;
  const snapshot = contract.estimateSnapshot as any;

  return (
    <div className="min-h-screen bg-muted/30 py-12 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold" data-testid="text-company-name">
            {company?.name || "Service Agreement"}
          </h1>
          <p className="text-muted-foreground mt-1">Contract {contract.contractNumber}</p>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <FileText className="h-6 w-6 text-muted-foreground" />
              <div>
                <CardTitle className="text-xl" data-testid="text-contract-number">
                  {contract.contractNumber}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Created {formatDate(contract.createdAt)}
                </p>
              </div>
            </div>
            <Badge variant={config.variant} data-testid="badge-status">
              {isSigned && <CheckCircle2 className="h-3 w-3 mr-1" />}
              {!isSigned && contract.status === "sent" && <Clock className="h-3 w-3 mr-1" />}
              {config.label}
            </Badge>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="bg-muted/50 p-4 rounded-md text-center">
              <p className="text-sm">{config.message}</p>
            </div>

            {customer && (
              <div>
                <h3 className="font-medium mb-2">Customer</h3>
                <p data-testid="text-customer-name">{customer.name}</p>
                {customer.email && (
                  <p className="text-sm text-muted-foreground">{customer.email}</p>
                )}
              </div>
            )}

            {snapshot && (
              <div>
                <h3 className="font-medium mb-2">Job Summary</h3>
                <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-md">
                  <div>
                    <p className="text-sm text-muted-foreground">Subtotal</p>
                    <p className="font-medium" data-testid="text-subtotal">
                      {formatCurrency(snapshot.subtotal)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tax</p>
                    <p className="font-medium" data-testid="text-tax">
                      {formatCurrency(snapshot.taxAmount)}
                    </p>
                  </div>
                  <div className="col-span-2 pt-2 border-t">
                    <p className="text-sm text-muted-foreground">Total</p>
                    <p className="text-xl font-bold" data-testid="text-total">
                      {formatCurrency(snapshot.total)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Contract Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] rounded-md border p-4">
              {contract.headerContent && (
                <div className="mb-6">
                  <pre className="whitespace-pre-wrap font-sans text-sm">
                    {contract.headerContent}
                  </pre>
                </div>
              )}
              
              {contract.workItemsContent && (
                <div className="mb-6">
                  <h4 className="font-semibold mb-2">SCOPE OF WORK</h4>
                  <pre className="whitespace-pre-wrap font-sans text-sm bg-muted/30 p-3 rounded-md">
                    {contract.workItemsContent}
                  </pre>
                </div>
              )}

              <Separator className="my-6" />

              {contract.termsContent && (
                <div className="mb-6">
                  <pre className="whitespace-pre-wrap font-sans text-sm">
                    {contract.termsContent}
                  </pre>
                </div>
              )}

              <Separator className="my-6" />

              {contract.footerContent && (
                <div>
                  <pre className="whitespace-pre-wrap font-sans text-sm">
                    {contract.footerContent}
                  </pre>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {canSign && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PenTool className="h-5 w-5" />
                Sign Contract
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="signerName">Full Legal Name</Label>
                <Input
                  id="signerName"
                  placeholder="John Doe"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  data-testid="input-signer-name"
                />
              </div>

              <div className="space-y-3">
                <Label>Signature</Label>
                <Tabs value={signatureType} onValueChange={(v) => setSignatureType(v as "typed" | "drawn")}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="drawn" className="flex items-center gap-2" data-testid="tab-drawn-signature">
                      <Pencil className="h-4 w-4" />
                      Draw Signature
                    </TabsTrigger>
                    <TabsTrigger value="typed" className="flex items-center gap-2" data-testid="tab-typed-signature">
                      <Type className="h-4 w-4" />
                      Type Initials
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="drawn" className="mt-4">
                    <SignaturePad
                      onSignatureChange={setDrawnSignature}
                      disabled={signMutation.isPending}
                    />
                  </TabsContent>
                  <TabsContent value="typed" className="mt-4">
                    <div className="space-y-2">
                      <Label htmlFor="signerInitials">Your Initials</Label>
                      <Input
                        id="signerInitials"
                        placeholder="JD"
                        maxLength={5}
                        value={signerInitials}
                        onChange={(e) => setSignerInitials(e.target.value.toUpperCase())}
                        className="text-2xl font-serif text-center tracking-widest"
                        data-testid="input-signer-initials"
                      />
                      <p className="text-xs text-muted-foreground text-center">
                        Your initials will serve as your electronic signature
                      </p>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>

              <div className="flex items-start space-x-3">
                <Checkbox
                  id="agree"
                  checked={agreedToTerms}
                  onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                  data-testid="checkbox-agree"
                />
                <Label htmlFor="agree" className="text-sm leading-relaxed cursor-pointer">
                  I have read and agree to the terms and conditions outlined in this service agreement.
                  By signing below, I authorize the work to be performed as described and agree to the payment terms.
                </Label>
              </div>

              <Button
                onClick={handleSign}
                disabled={signMutation.isPending || !isSignValid}
                className="w-full"
                size="lg"
                data-testid="button-sign"
              >
                <PenTool className="h-4 w-4 mr-2" />
                {signMutation.isPending ? "Signing..." : "Sign Contract"}
              </Button>
            </CardContent>
          </Card>
        )}

        {isSigned && contract.signerName && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
                <div>
                  <h3 className="font-semibold text-lg">Contract Signed</h3>
                  <p className="text-muted-foreground">
                    Signed by {contract.signerName} on {formatDate(contract.signedAt)}
                  </p>
                </div>
                {contract.signatureData && (
                  <div className="mt-4 flex justify-center">
                    <div className="border rounded-md p-2 bg-white dark:bg-gray-100">
                      <img 
                        src={contract.signatureData} 
                        alt="Signature" 
                        className="max-w-[300px] h-auto"
                        data-testid="img-signature"
                      />
                    </div>
                  </div>
                )}
                {!contract.signatureData && contract.signerInitials && (
                  <div className="mt-4">
                    <p className="text-2xl font-serif tracking-widest" data-testid="text-initials">
                      {contract.signerInitials}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="text-center text-sm text-muted-foreground">
          <p>Questions? Contact {company?.name || "the business"} directly.</p>
        </div>
      </div>
    </div>
  );
}
