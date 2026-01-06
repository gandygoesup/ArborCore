export type EstimateStatus = "draft" | "sent" | "approved" | "rejected" | "expired";
export type InvoiceStatus = "draft" | "sent" | "partial" | "paid" | "void" | "refunded";

const estimateTransitions: Record<EstimateStatus, EstimateStatus[]> = {
  draft: ["sent", "expired"],
  sent: ["approved", "rejected", "expired"],
  approved: [],
  rejected: [],
  expired: [],
};

export function assertEstimateTransition(from: string, to: string): void {
  const f = from as EstimateStatus;
  const t = to as EstimateStatus;
  const allowed = estimateTransitions[f] ?? [];
  if (!allowed.includes(t)) {
    const err = new Error(`Invalid estimate transition: ${from} -> ${to}`) as Error & { status: number };
    err.status = 400;
    throw err;
  }
}

export function assertEstimateEditable(status: string, actorRoles: string[]): void {
  const isAdmin = actorRoles.includes("Admin");
  if (!isAdmin && status !== "draft") {
    const err = new Error(`Estimate is locked in status "${status}"`) as Error & { status: number };
    err.status = 400;
    throw err;
  }
}

const invoiceTransitions: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ["sent", "void"],
  sent: ["partial", "paid", "void"],
  partial: ["paid", "void"],
  paid: ["refunded"],
  void: [],
  refunded: [],
};

export function assertInvoiceTransition(from: string, to: string): void {
  const f = from as InvoiceStatus;
  const t = to as InvoiceStatus;
  const allowed = invoiceTransitions[f] ?? [];
  if (!allowed.includes(t)) {
    const err = new Error(`Invalid invoice transition: ${from} -> ${to}`) as Error & { status: number };
    err.status = 400;
    throw err;
  }
}

export function assertInvoiceEditable(status: string, actorRoles: string[]): void {
  const isAdmin = actorRoles.includes("Admin");
  if (!isAdmin && status !== "draft") {
    const err = new Error(`Invoice is locked in status "${status}"`) as Error & { status: number };
    err.status = 400;
    throw err;
  }
}

export function assertInvoiceNotPaid(status: string): void {
  if (status === "paid" || status === "refunded") {
    const err = new Error(`Cannot modify paid or refunded invoice`) as Error & { status: number };
    err.status = 400;
    throw err;
  }
}
