
/* =====================================
   DEVICE VERIFICATION
   Telegram Mini App + Netlify
===================================== */

const tg = window.Telegram?.WebApp;

const statusElement = document.getElementById("status");
const retryButton = document.getElementById("retry");

// Update status
function setStatus(message) {
    statusElement.textContent = message;
}

// Show error
function showError(message) {
    setStatus(message);
    retryButton.hidden = false;
}

// Start verification
async function startVerification() {

    retryButton.hidden = true;

    // Check Telegram WebApp
    if (!tg) {
        showError(
            "Please open this page from your Telegram bot."
        );
        return;
    }

    // Initialize Telegram
    tg.ready();
    tg.expand();

    // Check Telegram authentication data
    if (!tg.initData) {
        showError(
            "Telegram authentication data is missing. Reopen the Mini App."
        );
        return;
    }

    // Check BiometricManager
    const biometric = tg.BiometricManager;

    if (!biometric || typeof biometric.init !== "function") {
        showError(
            "Your Telegram client does not support device verification."
        );
        return;
    }

    setStatus("Reading device identifier...");

    // Initialize BiometricManager
    biometric.init(async function () {

        const deviceId = biometric.deviceId;

        if (!deviceId) {
            showError(
                "Device identifier is unavailable on this Telegram client."
            );
            return;
        }

        setStatus("Checking your device...");

        try {

            // Send verification request to Netlify
            const response = await fetch(
                "/.netlify/functions/verify",
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({
                        initData: tg.initData,
                        deviceId: deviceId
                    })
                }
            );

            const result = await response.json();

            if (!response.ok || !result.ok) {
    showError(
        result.error ||
        result.message ||
        "Device verification failed. HTTP Status: " + response.status
    );
    return;
}

            // Verification request accepted
            setStatus(
                result.message ||
                "Verification request accepted. Return to your bot."
            );

            if (tg.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred("success");
            }

        } catch (error) {

            showError(
                "Network error. Please try again."
            );

        }

    });
}

// Retry button
retryButton.addEventListener(
    "click",
    startVerification
);

// Run verification
startVerification();
