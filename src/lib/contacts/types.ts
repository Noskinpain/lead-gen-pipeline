export interface RawContact {
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  department: string | null;
  seniority: string | null; // e.g. "founder" | "executive" | "director" | "manager" | "individual_contributor"
  email: string | null;
  source: string;
}

export interface ContactSource {
  name: string;
  findContacts(domain: string, companyName: string): Promise<RawContact[]>;
}