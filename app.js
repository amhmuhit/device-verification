/* =====================================
   THUNDER BOOST TG
   DEVICE VERIFICATION
   Telegram Mini App + Netlify
===================================== */

const tg = window.Telegram?.WebApp;

const statusElement = document.getElementById("status");
const retryButton = document.getElementById("retry");
const loader = document.getElementById("loader");


// ================================
// UPDATE STATUS
// ================================

function setStatus(message) {

    statusElement.textContent = message;

}


// ================================
// SHOW ERROR
// ================================

function showError(message) {

    setStatus(message);

    retryButton.hidden = false;
    loader.hidden = true;

}


// ================================
// START VERIFICATION
// ================================

async function startVerification() {

    retryButton.hidden = true;
    loader.hidden = false;


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


            // Check server response

            if (!response.ok || !result.ok) {

                showError(
                    "HTTP: " + response.status +
                    " | RESPONSE: " + JSON.stringify(result)
                );

                return;
            }


            // Verification request accepted

            setStatus(
                result.message ||
                "Verification request accepted. Return to your bot."
            );

            loader.hidden = true;


            // Success vibration

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


// ================================
// RETRY BUTTON
// ================================

retryButton.addEventListener(
    "click",
    startVerification
);


// ================================
// RUN VERIFICATION
// ================================

startVerification();
