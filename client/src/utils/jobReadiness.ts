export type JobReadinessStatus =
  | "PRE_ROPE_READY"
  | "AT_RISK"
  | "INCOMPLETE";

export interface JobReadiness {
  status: JobReadinessStatus;
  reasons: string[];
}

/**
 * Core rule:
 * “Would I show up to this job and not get screwed?”
 *
 * This logic is intentionally conservative.
 */
export function computeJobReadiness(job: any): JobReadiness {
  const reasons: string[] = [];

  // Must have an approved estimate
  if (!job.estimateId) {
    reasons.push("No approved estimate");
  }

  // Scope must be frozen
  if (!job.scopeLocked) {
    reasons.push("Scope not locked");
  }

  // Deposit handling (if required)
  if (job.depositRequired && !job.depositPaid) {
    reasons.push("Deposit not paid");
  }

  // Hazard awareness
  if (!job.hazards || job.hazards.length === 0) {
    reasons.push("Hazards not reviewed");
  }

  // Visual reference
  if (!job.photos || job.photos.length === 0) {
    reasons.push("No reference photos");
  }

  // ✅ Fully ready
  if (reasons.length === 0) {
    return {
      status: "PRE_ROPE_READY",
      reasons: [],
    };
  }

  // ⚠️ Allowed but risky (policy / override scenarios)
  if (
    job.estimateId &&
    job.scopeLocked &&
    reasons.length <= 2
  ) {
    return {
      status: "AT_RISK",
      reasons,
    };
  }

  // ❌ Not ready
  return {
    status: "INCOMPLETE",
    reasons,
  };
}
