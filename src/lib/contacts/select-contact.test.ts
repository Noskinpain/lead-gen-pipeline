import { selectBestContact } from "./select-contact";

// Case 1: multiple good candidates — should pick Head of Sales over CEO?
// (No — per role-rules.ts, founder_or_ceo outranks head_of_sales at 30 vs 25)
const candidates1 = [
  { firstName: "Jane", lastName: "Doe", jobTitle: "Founder & CEO", department: "Executive", seniority: "founder", email: "jane@acme.com", source: "test" },
  { firstName: "John", lastName: "Smith", jobTitle: "Head of Sales", department: "Sales", seniority: "executive", email: "john@acme.com", source: "test" },
];

// Case 2: no relevant roles at all
const candidates2 = [
  { firstName: "Sam", lastName: "Lee", jobTitle: "Frontend Developer", department: "Engineering", seniority: "individual_contributor", email: "sam@acme.com", source: "test" },
];

// Case 3: zero candidates
const candidates3: typeof candidates1 = [];

console.log("--- Case 1 ---", selectBestContact(candidates1));
console.log("--- Case 2 ---", selectBestContact(candidates2));
console.log("--- Case 3 ---", selectBestContact(candidates3));