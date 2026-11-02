
import { createHmac, timingSafeEqual } from "node:crypto";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

function hmacHash(value, secret) {
  return createHmac("sha256", secret)
    .update(value)
    .digest("hex");
}

function verifyTelegramInitData(initData, botToken) {
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");

  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) {
    return null;
  }

  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const calculatedHash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest();

  const receivedBuffer = Buffer.from(receivedHash, "hex");

  if (
    receivedBuffer.length !== calculatedHash.length ||
    !timingSafeEqual(receivedBuffer, calculatedHash)
  ) {
    return null;
  }

  const authDate = Number(params.get("auth_date"));
  const currentTime = Math.floor(Date.now() / 1000);

  // Reject missing, expired, or future-dated initData.
  if (
    !Number.isFinite(authDate) ||
    authDate <= 0 ||
    authDate > currentTime + 60 ||
    currentTime - authDate > 600
  ) {
    return null;
  }

  let user;

  try {
    user = JSON.parse(params.get("user") || "{}");
  } catch {
    return null;
  }

  if (!user.id) {
    return null;
  }

  return user;
}

export default async (req, context) => {
  try {
    if (req.method !== "POST") {
      return jsonResponse(
        { ok: false, error: "Method not allowed" },
        405
      );
    }

    const BOT_TOKEN = process.env.BOT_TOKEN;
    const TBC_WEBHOOK_URL = process.env.TBC_WEBHOOK_URL;
    const IP_HASH_SECRET = process.env.IP_HASH_SECRET;

    if (!BOT_TOKEN || !TBC_WEBHOOK_URL || !IP_HASH_SECRET) {
      return jsonResponse(
        { ok: false, error: "Server configuration missing" },
        500
      );
    }

    let body;

    try {
      body = await req.json();
    } catch {
      return jsonResponse(
        { ok: false, error: "Invalid JSON" },
        400
      );
    }

    const initData = body?.initData;
    const deviceId = body?.deviceId;

    if (
      typeof initData !== "string" ||
      typeof deviceId !== "string" ||
      !deviceId.trim() ||
      deviceId.length > 1000
    ) {
      return jsonResponse(
        { ok: false, error: "Invalid verification data" },
        400
      );
    }

    // Verify Telegram identity using signed initData.
    const user = verifyTelegramInitData(initData, BOT_TOKEN);

    if (!user) {
      return jsonResponse(
        { ok: false, error: "Telegram verification failed" },
        401
      );
    }

    // Get IP from Netlify's trusted function context,
    // not from browser-submitted data or arbitrary headers.
    const clientIp = context?.ip || "";

    const userAgent = req.headers.get("user-agent") || "";

    // Store only keyed hashes, never raw IP or User-Agent.
    const ipHash = clientIp
      ? hmacHash(clientIp, IP_HASH_SECRET)
      : "";

    const userAgentHash = userAgent
      ? hmacHash(userAgent, IP_HASH_SECRET)
      : "";

    const deviceHash = hmacHash(
      deviceId.trim(),
      IP_HASH_SECRET
    );

    // Send verified data to Telebot Creator.
    const webhookResponse = await fetch(TBC_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        user_id: String(user.id),
        device_hash: deviceHash,
        ip_hash: ipHash,
        user_agent_hash: userAgentHash
      })
    });

    if (!webhookResponse.ok) {
      return jsonResponse(
        { ok: false, error: "TBC verification service failed" },
        502
      );
    }

    return jsonResponse({
      ok: true,
      message: "Verification data received"
    });

  } catch (error) {
    console.error("Device verification error:", error);

    return jsonResponse(
      { ok: false, error: "Internal server error" },
      500
    );
  }
};
