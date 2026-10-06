import { scoreContactRole } from "./role-rules";

const testContacts = [
  { firstName: "Jane", lastName: "Doe", jobTitle: "Founder & CEO", department: "Executive", seniority: "founder", email: "jane@acme.com", source: "test" },
  { firstName: "John", lastName: "Smith", jobTitle: "Head of Sales", department: "Sales", seniority: "executive", email: "john@acme.com", source: "test" },
  { firstName: "Sam", lastName: "Lee", jobTitle: "Frontend Developer", department: "Engineering", seniority: "individual_contributor", email: "sam@acme.com", source: "test" },
  { firstName: "Alex", lastName: "Kim", jobTitle: null, department: null, seniority: null, email: null, source: "test" },
];

for (const c of testContacts) {
  console.log(c.jobTitle, "→", scoreContactRole(c));
}