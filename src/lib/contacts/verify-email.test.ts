import { verifyEmail } from "./verify-email";

async function main() {
  console.log(await verifyEmail(null));
  console.log(await verifyEmail("not-an-email"));
  console.log(await verifyEmail("test@mailinator.com"));
  console.log(await verifyEmail("sales@stripe.com"));
  console.log(await verifyEmail("jane.doe@stripe.com"));
  console.log(await verifyEmail("test@this-domain-does-not-exist-xyz123.com"));
}

main();