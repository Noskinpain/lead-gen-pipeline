export interface EvaluationEntry {
  companyId: string;
  companyName: string;
  humanFit: boolean;
  humanIntent: "high" | "medium" | "low";
  humanWorthContacting: boolean;
  notes?: string;
}

export const evaluationDataset: EvaluationEntry[] = [
  {
    companyId: "8bbac66f-4f28-425e-bbae-f1dc84b4c59e",
    companyName: "Stripe",
    humanFit: true,
    humanIntent: "low",
    humanWorthContacting: false,
    notes: "Too large/established for a realistic ICP match despite strong keyword fit — formula can't see company maturity beyond employee_count, which we don't even have for this record.",
  },
  {
    companyId: "3a1c0cc7-8d12-4ab4-b007-de967e238fb9",
    companyName: "Linear",
    humanFit: false,
    humanIntent: "low",
    humanWorthContacting: false,
    notes: "Actively growing but no visible hiring signal — feels like a one-off state rather than sustained active intent. Judged too established/self-sufficient to realistically be in-market for this ICP, despite being firmographically closer to target than Stripe/Salesforce/Nike.",
  },
  {
    companyId: "6572df9a-a059-4540-8a3d-dda83cdf5b94",
    companyName: "Salesforce",
    humanFit: false,
    humanIntent: "low",
    humanWorthContacting: false,
    notes: "Far too large/established to be a realistic prospect for this ICP.",
  },
  {
    companyId: "33e046a1-e0c7-45e2-975b-6b46ee6e9c22",
    companyName: "Nike",
    humanFit: false,
    humanIntent: "low",
    humanWorthContacting: false,
    notes: "B2C consumer brand, not B2B — clear industry mismatch for this ICP.",
  },
    {
    companyId: "53984b17-457f-4ffc-8ace-8af1888562c7",
    companyName: "Catlog",
    humanFit: false,
    humanIntent: "low",
    humanWorthContacting: false,
    notes: " for B2B ",
  },
];