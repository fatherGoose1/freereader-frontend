import { NextResponse } from "next/server";
import { archiveMetadata } from "../archive";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  const { status, data } = await archiveMetadata((await params).identifier);
  return data ? NextResponse.json(data) : NextResponse.json({ error: "archive_unavailable" }, { status });
}
