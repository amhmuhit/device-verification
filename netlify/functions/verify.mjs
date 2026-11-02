
import {
    createHash,
    createHmac,
    timingSafeEqual
} from "node:crypto";

// Verify Telegram Mini App initData
function validateTelegramInitData(initData, botToken) {

    const params = new URLSearchParams(initData);

    const receivedHash = params.get("hash");

    if (!receivedHash) {
        throw new Error("Missing Telegram signature.");
    }

    params.delete("hash");

    const entries = [...params.entries()]
        .sort(([a], [b]) => a.localeCompare(b));

    const dataCheckString = entries
        .map(([key, value]) => `${key}=${value}`)
        .join("\n");

    const secretKey = createHmac(
        "sha256",
        "WebAppData"
    ).update(botToken).digest();

    const calculatedHash = createHmac(
        "sha256",
        secretKey
    ).update(dataCheckString).digest();

    const received = Buffer.from(receivedHash, "hex");

    if (
        received.length !== calculatedHash.length ||
        !timingSafeEqual(received, calculatedHash)
    ) {
        throw new Error("Telegram authentication failed.");
    }

    // Check authentication expiry
    const authDate = Number(params.get("auth_date"));

    if (
        !Number.isFinite(authDate) ||
        Math.abs(Date.now() / 1000 - authDate) > 86400
    ) {
        throw new Error("Telegram session expired.");
    }

    // Get Telegram user
    const userRaw = params.get("user");

    if (!userRaw) {
        throw new Error("Telegram user data missing.");
    }

    const user = JSON.parse(userRaw);

    if (!user.id) {
        throw new Error("Invalid Telegram user.");
    }

    return user;
}


// Netlify Function
export default async (request) => {

    // Only POST allowed
    if (request.method !== "POST") {
        return new Response(
            JSON.stringify({
                ok: false,
                message: "Method not allowed."
            }),
            {
                status: 405,
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );
    }

    try {

        // Read environment variables
        const botToken = process.env.BOT_TOKEN;
        const webhookUrl = process.env.TBC_WEBHOOK_URL;

        if (!botToken || !webhookUrl) {
            throw new Error(
                "Server configuration is incomplete."
            );
        }

        // Read request body
        const body = await request.json();

        if (!body.initData || !body.deviceId) {
            throw new Error(
                "Verification information missing."
            );
        }

        // Verify Telegram authentication
        const user = validateTelegramInitData(
            body.initData,
            botToken
        );

        // Hash device ID
        const deviceHash = createHash("sha256")
            .update(String(body.deviceId))
            .digest("hex");

        // Send data to TBC webhook
        const tbcResponse = await fetch(webhookUrl, {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                user_id: String(user.id),
                device_hash: deviceHash
            })
        });

        if (!tbcResponse.ok) {
            throw new Error(
                "TBC verification service unavailable."
            );
        }

        return new Response(
            JSON.stringify({
                ok: true,
                message:
                    "Verification request accepted. Return to your bot."
            }),
            {
                status: 200,
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );

    } catch (error) {

        return new Response(
            JSON.stringify({
                ok: false,
                message:
                    error.message || "Verification failed."
            }),
            {
                status: 400,
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );

    }
};
