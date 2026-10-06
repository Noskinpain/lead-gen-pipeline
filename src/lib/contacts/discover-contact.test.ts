import { discoverContact } from "./discover-contact";

async function main() {
  // Run a few times against different companies since the mock source is randomized
  const { data: companies } = await (await import("../supabase")).supabase
    .from("companies")
    .select("id, company_name")
    .eq("source", "manual_test");

  for (const c of companies ?? []) {
    const result = await discoverContact(c.id);
    console.log(c.company_name, "→", result);
  }
}

main();