import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// Resend's official test address — simulates a real send/delivery
// without any mail actually reaching a real inbox.
const TEST_RECIPIENT = "delivered@resend.dev";

export interface SendResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

export async function sendEmail(subject: string, body: string, realRecipientEmail: string): Promise<SendResult> {
  // Deliberately override the real recipient with the safe test address —
  // today's build proves the pipeline works without risking a real send
  // to someone whose lawful-basis-for-contact question is still open.
  void realRecipientEmail; // acknowledged but intentionally unused today

  try {
    const result = await resend.emails.send({
      from: "onboarding@resend.dev", // Resend's shared sandbox sender
      to: TEST_RECIPIENT,
      subject,
      text: body,
    });

    if (result.error) {
      return { success: false, error: result.error.message };
    }

    return { success: true, providerMessageId: result.data?.id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}