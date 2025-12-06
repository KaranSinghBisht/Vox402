// apps/web/src/app/api/session/clear/route.ts
import { NextRequest, NextResponse } from "next/server";
import { clearSession } from "@/lib/gemini";

export async function POST(request: NextRequest) {
    try {
        const { sessionId } = await request.json();
        if (sessionId) {
            clearSession(sessionId);
        }
        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json({ ok: true });
    }
}
