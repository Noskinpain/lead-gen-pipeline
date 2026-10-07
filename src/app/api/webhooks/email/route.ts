import { NextRequest, NextResponse } from "next/server";

import { supabase } from "@/lib/supabase";
import {
  assertTransition,
  MessageStatus,
} from "@/lib/outreach/state-machine";
import { logger } from "@/lib/logger";

// Maps a provider event type to the message status it should produce.
const EVENT_TO_STATUS: Record<string, MessageStatus> = {
  delivered: "DELIVERED",
  bounced: "BOUNCED",
  replied: "REPLIED",
  unsubscribed: "UNSUBSCRIBED",
};

export async function POST(req: NextRequest) {
  // Authenticate webhook request
  const providedSecret = req.headers.get("x-webhook-secret");

  if (providedSecret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const body = await req.json();
  const { provider_message_id, event_type } = body;

  if (!provider_message_id || !event_type) {
    return NextResponse.json(
      {
        error: "Missing provider_message_id or event_type",
      },
      { status: 400 }
    );
  }

  const { data: message } = await supabase
    .from("outreach_messages")
    .select("id, status")
    .eq("provider_message_id", provider_message_id)
    .single();

  if (!message) {
    // A webhook for a message we don't recognize — log it, don't crash.
    // Could be a duplicate delivery, a test event, or a real data mismatch.
    logger.warn("Webhook received for unknown message", {
      provider_message_id,
      event_type,
    });

    return NextResponse.json({
      status: "ignored",
      reason: "Unknown message",
    });
  }

  // Idempotency check: has this exact event already been recorded for
  // this message? Prevents duplicate webhook deliveries from
  // double-processing.
  const { data: existingEvent } = await supabase
    .from("outreach_events")
    .select("id")
    .eq("message_id", message.id)
    .eq("event_type", event_type)
    .maybeSingle();

  if (existingEvent) {
    logger.info("Duplicate webhook event ignored", {
      messageId: message.id,
      event_type,
    });

    return NextResponse.json({
      status: "ignored",
      reason: "Duplicate event",
    });
  }

  const targetStatus = EVENT_TO_STATUS[event_type];

  if (targetStatus) {
    try {
      assertTransition(
        message.status as MessageStatus,
        targetStatus
      );

      await supabase
        .from("outreach_messages")
        .update({
          status: targetStatus,
        })
        .eq("id", message.id);
    } catch (err) {
      // The event arrived but doesn't make sense given current state
      // (e.g. a "delivered" event for an already-BOUNCED message).
      // Log it honestly rather than forcing an invalid transition.
      logger.warn(
        "Webhook event ignored — invalid state transition",
        {
          messageId: message.id,
          currentStatus: message.status,
          event_type,
          error:
            err instanceof Error
              ? err.message
              : "Unknown error",
        }
      );

      return NextResponse.json({
        status: "ignored",
        reason: "Invalid state transition",
      });
    }
  }

  await supabase.from("outreach_events").insert({
    message_id: message.id,
    event_type,
    event_data: body,
  });

  logger.info("Webhook event processed", {
    messageId: message.id,
    event_type,
  });

  return NextResponse.json({
    status: "processed",
  });
}