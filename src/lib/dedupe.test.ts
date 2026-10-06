import { checkDuplicate, ExistingCompany } from "./dedupe";

const existing: ExistingCompany[] = [
  { id: "abc-1", normalized_name: "Terry-Arnold", domain: "shepard.biz", location: "Nicaragua" },
  { id: "abc-2", normalized_name: "Mckay Limited", domain: "valencia.com", location: "Palestinian Territory" },
];

// Should match Tier 1 — same domain, different name format
console.log(checkDuplicate(
  { company_name: "Terry-Arnold Inc.", website: "http://www.shepard.biz/", location: "Nicaragua" },
  existing
));

// Should match Tier 2 — similar name, no domain, same location
console.log(checkDuplicate(
  { company_name: "Mckay Ltd", website: "unknown.org", location: "Palestinian Territory" },
  existing
));

// Should NOT match — different company entirely
console.log(checkDuplicate(
  { company_name: "Barnes-Robles", website: "https://garcia.com/", location: "Jordan" },
  existing
));