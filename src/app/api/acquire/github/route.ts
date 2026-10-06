import { NextResponse } from "next/server";
import { runAcquisition } from "@/lib/acquisition";
import { githubAdapter } from "@/lib/sources/github-adapter";

export async function POST() {
  try {
    await runAcquisition(githubAdapter, 5);
    return NextResponse.json({ status: "success" });
  } catch (err) {
    return NextResponse.json(
      { status: "failed", error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}