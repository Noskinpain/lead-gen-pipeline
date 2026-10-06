import { enrichCompany } from "./enrich-company";
import { supabase } from "../supabase";

async function main() {
  // Insert a real, known-good test company first
 const { data: company } = await supabase
  .from("companies")
  .select("id")
  .eq("company_name", "Stripe")
  .single();

const result = await enrichCompany(company!.id);
console.log(result);
}

main();