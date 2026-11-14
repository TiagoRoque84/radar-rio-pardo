import { NextResponse } from "next/server";
import { getCurrentUser, revokeCurrentSession } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/auth/audit";

export async function POST() {
  const user = await getCurrentUser();
  if (user) {
    await recordAuditLog({
      userId: user.id,
      action: "LOGOUT",
      entityType: "User",
      entityId: user.id,
    });
  }
  await revokeCurrentSession();
  return NextResponse.json({ ok: true });
}
