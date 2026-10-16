import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// Resend's official test address: simulates a real send/delivery without any
// mail reaching a real inbox. Real sending is deliberately not enabled yet.
const TEST_RECIPIENT = "delivered@resend.dev";

export interface SendResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

export async function sendEmail(
  subject: string,
  body: string,
  realRecipientEmail: string,
  headers?: Record<string, string>
): Promise<SendResult> {
  // The real recipient is accepted but deliberately unused: every send goes to
  // the sandbox address until real sending is switched on.
  void realRecipientEmail;

  try {
    const result = await resend.emails.send({
      from: "onboarding@resend.dev", // Resend's shared sandbox sender
      to: TEST_RECIPIENT,
      subject,
      text: body,
      headers,
    });

    if (result.error) {
      return { success: false, error: result.error.message };
    }

    return { success: true, providerMessageId: result.data?.id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}