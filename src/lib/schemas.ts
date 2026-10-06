import { z } from "zod";

export const CompanyInputSchema = z.object({
  company_name: z.string().trim().min(1, "Company name is required"),
 website: z
  .string()
  .trim()
  .min(1, "Website is required")
  .refine((val) => {
    const withProtocol = /^https?:\/\//.test(val) ? val : `https://${val}`;
    try {
      const url = new URL(withProtocol);
      // require a hostname with at least one dot — rules out "hello", "localhost", etc.
      return url.hostname.includes(".");
    } catch {
      return false;
    }
  }, "Must be a valid website URL"),
  industry: z.string().trim().optional().default("Unknown"),
  location: z.string().trim().optional().default("Unknown"),
  employee_count: z.coerce
    .number({ error: "employee_count must be a number" })
    .int()
    .nonnegative()
    .optional(),
});

export type CompanyInput = z.infer<typeof CompanyInputSchema>;

export const IngestRequestSchema = z.object({
  source: z.string().trim().min(1, "source is required"),
  companies: z.array(CompanyInputSchema).min(1, "companies array cannot be empty"),
});

export type IngestRequest = z.infer<typeof IngestRequestSchema>;