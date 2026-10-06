import { ContactSource, RawContact } from "./types";

// A small, realistic pool of role archetypes — deliberately mixing
// relevant and irrelevant roles, since a real source would too.
const ROLE_POOL: Array<{ jobTitle: string; department: string; seniority: string }> = [
  { jobTitle: "Founder & CEO", department: "Executive", seniority: "founder" },
  { jobTitle: "Head of Sales", department: "Sales", seniority: "executive" },
  { jobTitle: "Head of Marketing", department: "Marketing", seniority: "executive" },
  { jobTitle: "Sales Director", department: "Sales", seniority: "director" },
  { jobTitle: "Marketing Manager", department: "Marketing", seniority: "manager" },
  { jobTitle: "Frontend Developer", department: "Engineering", seniority: "individual_contributor" },
  { jobTitle: "Office Coordinator", department: "Operations", seniority: "individual_contributor" },
  { jobTitle: "Accountant", department: "Finance", seniority: "individual_contributor" },
];

const FIRST_NAMES = ["Jane", "John", "Amara", "David", "Chidi", "Sarah", "Michael", "Fatima"];
const LAST_NAMES = ["Doe", "Smith", "Okafor", "Johnson", "Eze", "Williams", "Bello", "Brown"];

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const mockContactSource: ContactSource = {
  name: "mock_contact_source",

  async findContacts(domain: string, companyName: string): Promise<RawContact[]> {
    // Simulate a real source's imperfection: sometimes returns 0-4 contacts,
    // not always a clean, complete set.
    const contactCount = Math.floor(Math.random() * 5);
    const contacts: RawContact[] = [];

    // Track which roles are used so we don't duplicate within one company
    const usedRoles = new Set<number>();

    for (let i = 0; i < contactCount; i++) {
      let roleIndex: number;
      do {
        roleIndex = Math.floor(Math.random() * ROLE_POOL.length);
      } while (usedRoles.has(roleIndex) && usedRoles.size < ROLE_POOL.length);
      usedRoles.add(roleIndex);

      const role = ROLE_POOL[roleIndex];
      const firstName = randomFrom(FIRST_NAMES);
      const lastName = randomFrom(LAST_NAMES);

      // Simulate realistic gaps: ~15% chance email is missing,
      // ~10% chance job title is missing (a real source's data is messy too).
      const hasEmail = Math.random() > 0.15;
      const hasTitle = Math.random() > 0.1;

      contacts.push({
        firstName,
        lastName,
        jobTitle: hasTitle ? role.jobTitle : null,
        department: hasTitle ? role.department : null,
        seniority: hasTitle ? role.seniority : null,
        email: hasEmail ? `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}` : null,
        source: "mock_contact_source",
      });
    }

    return contacts;
  },
};