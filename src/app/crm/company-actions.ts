"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { normalizeCompanyName, normalizeDomain, normalizeIndustry, normalizeLocation } from "@/lib/normalize";
import { checkDuplicate, type ExistingCompany } from "@/lib/dedupe";
import { verifyEmail, type EmailStatus } from "@/lib/contacts/verify-email";
import { scoreContactRole } from "@/lib/contacts/role-rules";
import { calculateContactConfidence } from "@/lib/contacts/confidence";
import { describeZodError, emptyToUndefined, safeReturnTo } from "@/lib/crm/form-helpers";
import { finish, isApprovedPerson, logEvent, type Outcome } from "@/lib/crm/action-helpers";
import { escapeLike, must } from "@/lib/crm/db";
import { DEAL_START_STAGES, SENIORITIES } from "@/lib/crm/company-constants";

// ---------- Companies ----------

const CompanyFieldsSchema = z.object({
  name: z.string().trim().min(1).max(200),
  website: z.preprocess(emptyToUndefined, z.string().trim().max(300).optional()),
  industry: z.preprocess(emptyToUndefined, z.string().trim().max(120).optional()),
  location: z.preprocess(emptyToUndefined, z.string().trim().max(120).optional()),
  employeeCount: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(10000000).optional()),
});

const UpdateCompanySchema = CompanyFieldsSchema.extend({ companyId: z.uuid() });

// A website is optional, but if given it must have a real-looking domain.
function resolveWebsite(
  website: string | undefined
): { ok: true; website: string | null; domain: string | null } | { ok: false } {
  if (!website) return { ok: true, website: null, domain: null };
  const domain = normalizeDomain(website);
  if (!domain || !domain.includes(".")) return { ok: false };
  const withProtocol = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  return { ok: true, website: withProtocol, domain };
}

type CreateCompanyResult = { ok: true; message: string; companyId: string } | { ok: false; error: string };

async function performCreateCompany(
  input: z.infer<typeof CompanyFieldsSchema>,
  confirmDuplicate: boolean
): Promise<CreateCompanyResult> {
  const site = resolveWebsite(input.website);
  if (!site.ok) return { ok: false, error: "That website doesn't look like a real address." };

  if (site.domain) {
    const { data: sameDomain } = await supabase
      .from("companies")
      .select("id, company_name")
      .eq("domain", site.domain)
      .limit(1);
    if (sameDomain && sameDomain.length > 0) {
      return { ok: false, error: `${sameDomain[0].company_name} already uses ${site.domain}.` };
    }
  }

  if (!confirmDuplicate) {
    const existing = must<Array<{ id: string; normalized_name: string; domain: string | null; location: string | null }>>(
      await supabase.from("companies").select("id, normalized_name, domain, location"),
      "companies"
    );
    const asExisting: ExistingCompany[] = existing.map((e) => ({
      id: e.id,
      normalized_name: e.normalized_name,
      domain: e.domain,
      location: e.location ?? "",
    }));

    const dedupe = checkDuplicate(
      {
        company_name: input.name,
        website: site.website ?? "",
        location: input.location ? normalizeLocation(input.location) : "",
      },
      asExisting
    );

    if (dedupe.isDuplicate !== false) {
      const { data: match } = await supabase.from("companies").select("company_name").eq("id", dedupe.matchedId).limit(1);
      const matchName = match?.[0]?.company_name ?? "an existing company";
      return {
        ok: false,
        error: `Looks like a duplicate of ${matchName}. Tick "create anyway" if it's a different company.`,
      };
    }
  }

  const { data: created, error } = await supabase
    .from("companies")
    .insert({
      company_name: input.name,
      normalized_name: normalizeCompanyName(input.name),
      website: site.website,
      domain: site.domain,
      industry: input.industry ? normalizeIndustry(input.industry) : null,
      location: input.location ? normalizeLocation(input.location) : null,
      employee_count: input.employeeCount ?? null,
      source: "manual",
      status: "active",
    })
    .select("id")
    .single();

  if (error || !created) {
    if (error?.code === "23505") return { ok: false, error: "Another company already uses that website." };
    logger.error("createCompany failed", { error: error?.message });
    return { ok: false, error: "Could not create the company." };
  }

  return { ok: true, message: "Company added.", companyId: created.id };
}

export async function createCompany(formData: FormData): Promise<void> {
  await requireUser();
  const returnTo = safeReturnTo(formData.get("returnTo"), "/crm/companies");
  const parsed = CompanyFieldsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) finish(returnTo, { ok: false, error: describeZodError(parsed.error) });

  const result = await performCreateCompany(parsed.data, formData.get("confirmDuplicate") === "on");
  if (!result.ok) finish(returnTo, result);
  finish(`/crm/companies/${result.companyId}`, result);
}

async function performUpdateCompany(input: z.infer<typeof UpdateCompanySchema>): Promise<Outcome> {
  const site = resolveWebsite(input.website);
  if (!site.ok) return { ok: false, error: "That website doesn't look like a real address." };

  if (site.domain) {
    const { data: clash } = await supabase
      .from("companies")
      .select("id, company_name")
      .eq("domain", site.domain)
      .neq("id", input.companyId)
      .limit(1);
    if (clash && clash.length > 0) return { ok: false, error: `${clash[0].company_name} already uses ${site.domain}.` };
  }

  const { data: updated, error } = await supabase
    .from("companies")
    .update({
      company_name: input.name,
      normalized_name: normalizeCompanyName(input.name),
      website: site.website,
      domain: site.domain,
      industry: input.industry ? normalizeIndustry(input.industry) : null,
      location: input.location ? normalizeLocation(input.location) : null,
      employee_count: input.employeeCount ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.companyId)
    .select("id");

  if (error) {
    if (error.code === "23505") return { ok: false, error: "Another company already uses that website." };
    logger.error("updateCompany failed", { error: error.message });
    return { ok: false, error: "Could not save the company." };
  }
  if (!updated || updated.length === 0) return { ok: false, error: "Company not found." };

  return { ok: true, message: "Company saved." };
}

export async function updateCompany(formData: FormData): Promise<void> {
  await requireUser();
  const returnTo = safeReturnTo(formData.get("returnTo"), "/crm/companies");
  const parsed = UpdateCompanySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) finish(returnTo, { ok: false, error: describeZodError(parsed.error) });
  finish(returnTo, await performUpdateCompany(parsed.data));
}

const ArchiveCompanySchema = z.object({
  companyId: z.uuid(),
  archived: z.enum(["0", "1"]),
});

async function performArchive(input: z.infer<typeof ArchiveCompanySchema>): Promise<Outcome> {
  const archive = input.archived === "1";

  if (archive) {
    const { count } = await supabase
      .from("opportunities")
      .select("id", { count: "exact", head: true })
      .eq("company_id", input.companyId)
      .not("stage", "in", "(won,lost)");
    if ((count ?? 0) > 0) return { ok: false, error: "This company has open deals. Close them before archiving." };
  }

  const { data: updated, error } = await supabase
    .from("companies")
    .update({ status: archive ? "archived" : "active", updated_at: new Date().toISOString() })
    .eq("id", input.companyId)
    .select("id");

  if (error) {
    logger.error("archive failed", { error: error.message });
    return { ok: false, error: "Could not update the company." };
  }
  if (!updated || updated.length === 0) return { ok: false, error: "Company not found." };

  return { ok: true, message: archive ? "Company archived." : "Company restored." };
}

export async function setCompanyArchived(formData: FormData): Promise<void> {
  await requireUser();
  const returnTo = safeReturnTo(formData.get("returnTo"), "/crm/companies");
  const parsed = ArchiveCompanySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) finish(returnTo, { ok: false, error: describeZodError(parsed.error) });
  finish(returnTo, await performArchive(parsed.data));
}

// ---------- Contacts ----------

const ContactFieldsSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  jobTitle: z.preprocess(emptyToUndefined, z.string().trim().max(150).optional()),
  department: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
  seniority: z.preprocess(emptyToUndefined, z.enum(SENIORITIES).optional()),
  email: z.preprocess(emptyToUndefined, z.email().optional()),
});

const CreateContactSchema = ContactFieldsSchema.extend({ companyId: z.uuid() });
const UpdateContactSchema = ContactFieldsSchema.extend({ contactId: z.uuid() });

// Same role score and confidence formulas the automatic contact finder uses,
// so manual and discovered contacts are comparable.
function scoreContact(
  input: { firstName: string; lastName: string; jobTitle?: string; department?: string; seniority?: string },
  email: string | undefined,
  status: EmailStatus
) {
  const { score } = scoreContactRole({
    firstName: input.firstName,
    lastName: input.lastName,
    jobTitle: input.jobTitle ?? null,
    department: input.department ?? null,
    seniority: input.seniority ?? null,
    email: email ?? null,
    source: "manual",
  });
  return { contactScore: score, confidence: calculateContactConfidence(score, status) };
}

async function performCreateContact(input: z.infer<typeof CreateContactSchema>): Promise<Outcome> {
  const { data: company } = await supabase.from("companies").select("id").eq("id", input.companyId).maybeSingle();
  if (!company) return { ok: false, error: "Company not found." };

  const email = input.email?.toLowerCase();

  if (email) {
    const { data: clash } = await supabase
      .from("contacts")
      .select("id")
      .eq("company_id", input.companyId)
      .ilike("email", escapeLike(email))
      .limit(1);
    if (clash && clash.length > 0) return { ok: false, error: "This company already has a contact with that email." };
  }

  const verification = await verifyEmail(email ?? null);
  const { contactScore, confidence } = scoreContact(input, email, verification.status);

  const { error } = await supabase.from("contacts").insert({
    company_id: input.companyId,
    first_name: input.firstName,
    last_name: input.lastName,
    job_title: input.jobTitle ?? null,
    department: input.department ?? null,
    seniority: input.seniority ?? null,
    email: email ?? null,
    email_status: verification.status,
    email_source: email ? "manual" : null,
    contact_source: "manual",
    contact_score: contactScore,
    confidence,
  });

  if (error) {
    logger.error("createContact failed", { error: error.message });
    return { ok: false, error: "Could not add the contact." };
  }

  return { ok: true, message: email ? `Contact added. Email check: ${verification.status}.` : "Contact added." };
}

export async function createContact(formData: FormData): Promise<void> {
  await requireUser();
  const returnTo = safeReturnTo(formData.get("returnTo"), "/crm/companies");
  const parsed = CreateContactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) finish(returnTo, { ok: false, error: describeZodError(parsed.error) });
  finish(returnTo, await performCreateContact(parsed.data));
}

async function performUpdateContact(input: z.infer<typeof UpdateContactSchema>): Promise<Outcome> {
  const { data: current } = await supabase
    .from("contacts")
    .select("id, company_id, email, email_status")
    .eq("id", input.contactId)
    .maybeSingle();
  if (!current) return { ok: false, error: "Contact not found." };

  const email = input.email?.toLowerCase();
  const emailChanged = (current.email ?? "").toLowerCase() !== (email ?? "");

  if (email && emailChanged) {
    const { data: clash } = await supabase
      .from("contacts")
      .select("id")
      .eq("company_id", current.company_id)
      .neq("id", input.contactId)
      .ilike("email", escapeLike(email))
      .limit(1);
    if (clash && clash.length > 0) return { ok: false, error: "Another contact at this company has that email." };
  }

  // Only re-run the email check when the address actually changed.
  let status = (current.email_status ?? "unknown") as EmailStatus;
  if (emailChanged) status = (await verifyEmail(email ?? null)).status;

  const { contactScore, confidence } = scoreContact(input, email, status);

  const changes: Record<string, unknown> = {
    first_name: input.firstName,
    last_name: input.lastName,
    job_title: input.jobTitle ?? null,
    department: input.department ?? null,
    seniority: input.seniority ?? null,
    email: email ?? null,
    email_status: status,
    contact_score: contactScore,
    confidence,
    updated_at: new Date().toISOString(),
  };
  if (emailChanged) changes.email_source = email ? "manual" : null;

  const { error } = await supabase.from("contacts").update(changes).eq("id", input.contactId);
  if (error) {
    logger.error("updateContact failed", { error: error.message });
    return { ok: false, error: "Could not save the contact." };
  }

  return { ok: true, message: emailChanged && email ? `Contact saved. Email check: ${status}.` : "Contact saved." };
}

export async function updateContact(formData: FormData): Promise<void> {
  await requireUser();
  const returnTo = safeReturnTo(formData.get("returnTo"), "/crm/companies");
  const parsed = UpdateContactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) finish(returnTo, { ok: false, error: describeZodError(parsed.error) });
  finish(returnTo, await performUpdateContact(parsed.data));
}

// ---------- Deals ----------

const CreateDealSchema = z.object({
  companyId: z.uuid(),
  contactId: z.preprocess(emptyToUndefined, z.uuid().optional()),
  name: z.string().trim().min(1).max(200),
  estimatedValue: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
  stage: z.enum(DEAL_START_STAGES),
});

type CreateDealResult = { ok: true; message: string; dealId: string } | { ok: false; error: string };

async function performCreateDeal(userId: string, input: z.infer<typeof CreateDealSchema>): Promise<CreateDealResult> {
  const { data: company } = await supabase.from("companies").select("id, status").eq("id", input.companyId).maybeSingle();
  if (!company) return { ok: false, error: "Company not found." };
  if (company.status === "archived") return { ok: false, error: "Restore this company before creating a deal." };

  if (input.contactId) {
    const { data: contact } = await supabase
      .from("contacts")
      .select("id")
      .eq("id", input.contactId)
      .eq("company_id", input.companyId)
      .maybeSingle();
    if (!contact) return { ok: false, error: "Pick a contact from this company." };
  }

  // One open deal per company and contact. The database enforces this when a
  // contact is set; this check also covers deals with no contact.
  let openQuery = supabase
    .from("opportunities")
    .select("id")
    .eq("company_id", input.companyId)
    .not("stage", "in", "(won,lost)");
  openQuery = input.contactId ? openQuery.eq("contact_id", input.contactId) : openQuery.is("contact_id", null);
  const { data: openDeals } = await openQuery.limit(1);
  if (openDeals && openDeals.length > 0) {
    return { ok: false, error: "There is already an open deal for this company and contact." };
  }

  const { data: created, error } = await supabase
    .from("opportunities")
    .insert({
      company_id: input.companyId,
      contact_id: input.contactId ?? null,
      name: input.name,
      stage: input.stage,
      estimated_value: input.estimatedValue ?? null,
      owner_id: userId,
      source: "manual",
    })
    .select("id")
    .single();

  if (error || !created) {
    if (error?.code === "23505") return { ok: false, error: "That contact already has an open deal." };
    logger.error("createDeal failed", { error: error?.message });
    return { ok: false, error: "Could not create the deal." };
  }

  await logEvent(created.id, userId, "opportunity_created", { toStage: input.stage, metadata: { source: "manual" } });
  return { ok: true, message: "Deal created.", dealId: created.id };
}

export async function createDeal(formData: FormData): Promise<void> {
  const user = await requireUser();
  const returnTo = safeReturnTo(formData.get("returnTo"), "/crm/companies");
  const parsed = CreateDealSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) finish(returnTo, { ok: false, error: describeZodError(parsed.error) });

  const result = await performCreateDeal(user.id, parsed.data);
  if (!result.ok) finish(returnTo, result);
  finish(`/crm/opportunities/${result.dealId}`, result);
}

// ---------- Company notes ----------

const AddCompanyNoteSchema = z.object({
  companyId: z.uuid(),
  contactId: z.preprocess(emptyToUndefined, z.uuid().optional()),
  body: z.string().trim().min(1).max(5000),
});

async function performAddCompanyNote(userId: string, input: z.infer<typeof AddCompanyNoteSchema>): Promise<Outcome> {
  const { data: company } = await supabase.from("companies").select("id").eq("id", input.companyId).maybeSingle();
  if (!company) return { ok: false, error: "Company not found." };

  if (input.contactId) {
    const { data: contact } = await supabase
      .from("contacts")
      .select("id")
      .eq("id", input.contactId)
      .eq("company_id", input.companyId)
      .maybeSingle();
    if (!contact) return { ok: false, error: "Pick a contact from this company." };
  }

  const { error } = await supabase.from("notes").insert({
    company_id: input.companyId,
    contact_id: input.contactId ?? null,
    author_id: userId,
    body: input.body,
  });

  if (error) {
    logger.error("addCompanyNote failed", { error: error.message });
    return { ok: false, error: "Could not save the note." };
  }
  return { ok: true, message: "Note added." };
}

export async function addCompanyNote(formData: FormData): Promise<void> {
  const user = await requireUser();
  const returnTo = safeReturnTo(formData.get("returnTo"), "/crm/companies");
  const parsed = AddCompanyNoteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) finish(returnTo, { ok: false, error: describeZodError(parsed.error) });
  finish(returnTo, await performAddCompanyNote(user.id, parsed.data));
}