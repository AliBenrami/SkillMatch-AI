import { NextResponse } from "next/server";
import { setSessionUser } from "@/lib/auth";
import { getLoginThrottleStatus, recordFailedLoginAttempt, resetLoginThrottle, verifyCredentials } from "@/lib/auth-model";
import { appendAuditEvent } from "@/lib/db";
import { loginRequestSchema, parseJsonRequestBody } from "@/lib/validation";

async function appendLoginAuditEvent(input: {
  actor: string;
  action: "failed_login" | "login";
  details: Record<string, unknown>;
}) {
  try {
    await appendAuditEvent(input);
  } catch (error) {
    console.error("Unable to append login audit event", error);
  }
}

function getRequestIpAddress(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const [firstIp] = forwardedFor.split(",");
    if (firstIp?.trim()) {
      return firstIp.trim();
    }
  }

  const realIp = request.headers.get("x-real-ip");
  return realIp?.trim() ? realIp.trim() : null;
}

function createThrottledResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    {
      error: "Too many login attempts. Try again later.",
      retryAfterSeconds
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds)
      }
    }
  );
}

export async function POST(request: Request) {
  try {
    const { data, error } = await parseJsonRequestBody(loginRequestSchema, request);
    if (!data) {
      if (error === "Malformed JSON body.") {
        await appendLoginAuditEvent({
          actor: "anonymous",
          action: "failed_login",
          details: { reason: "malformed_json" }
        });
      }

      return NextResponse.json({ error }, { status: 400 });
    }

    const { email, password } = data;
    const ip = getRequestIpAddress(request);
    const throttleStatus = getLoginThrottleStatus({ email, ip });

    if (throttleStatus.throttled) {
      await appendLoginAuditEvent({
        actor: email || "anonymous",
        action: "failed_login",
        details: {
          reason: "login_throttled",
          throttleScope: throttleStatus.scope,
          retryAfterSeconds: throttleStatus.retryAfterSeconds,
          ip
        }
      });
      return createThrottledResponse(throttleStatus.retryAfterSeconds);
    }

    const user = await verifyCredentials(email, password);

    if (!user) {
      const updatedThrottleStatus = recordFailedLoginAttempt({ email, ip });

      await appendLoginAuditEvent({
        actor: email || "anonymous",
        action: "failed_login",
        details: updatedThrottleStatus.throttled
          ? {
              reason: "login_throttled",
              throttleScope: updatedThrottleStatus.scope,
              retryAfterSeconds: updatedThrottleStatus.retryAfterSeconds,
              ip
            }
          : { reason: "invalid_credentials", ip }
      });

      if (updatedThrottleStatus.throttled) {
        return createThrottledResponse(updatedThrottleStatus.retryAfterSeconds);
      }

      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    resetLoginThrottle({ email, ip });
    await setSessionUser(user);
    await appendLoginAuditEvent({
      actor: user.email,
      action: "login",
      details: { role: user.role, ip }
    });

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Unable to complete login", error);
    return NextResponse.json({ error: "Sign in is temporarily unavailable." }, { status: 500 });
  }
}
