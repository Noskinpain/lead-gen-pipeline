import { CompanyInputSchema } from "./schemas";

// Should pass
console.log(CompanyInputSchema.safeParse({
  company_name: "Terry-Arnold",
  website: "https://shepard.biz/",
  industry: "Consumer Services",
  location: "Nicaragua",
  employee_count: "410", // string, but coercible
}));

// Should fail — your original bad example

const result = CompanyInputSchema.safeParse({
  company_name: "",
  website: "hello",
  employees: "a lot",
});
if (!result.success) {
  console.log(result.error.issues);
}