import { enrichBatch } from "./enrich-batch";
import { supabase } from "../supabase";

async function main() {
  const { data: companies } = await supabase
    .from("companies")
    .select("id, company_name")
    .eq("source", "manual_test");

  console.log("Enriching:", companies?.map((c) => c.company_name));

  const ids = companies!.map((c) => c.id);
  const result = await enrichBatch(ids);
  console.log(result);
}

main();