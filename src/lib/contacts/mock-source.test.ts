import { mockContactSource } from "./mock-source";

async function main() {
  const contacts = await mockContactSource.findContacts("acme.com", "Acme Ltd");
  console.log(`Found ${contacts.length} contacts:`);
  console.log(contacts);
}

main();