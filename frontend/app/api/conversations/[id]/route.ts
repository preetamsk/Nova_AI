import { NextResponse } from "next/server";

export async function DELETE() {
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json([]);
}
