
const axios = require('axios');
const cron = require('node-cron');
const admin = require('./firebase'); // Import the Firebase Admin SDK
const express = require('express');

// === API Config ===
const API_URL = "https://rcbmpapi.ticketgenie.in/ticket/eventlist/O"; // Replace with your target API
const INTERVAL_SECONDS = 45; // Polling interval in seconds

// Use Firestore instead of Realtime Database
const db = admin.firestore();
const deviceTokensCollection = db.collection('deviceTokens');

// Register a new device token
async function registerDeviceToken(token) {
    try {
        await deviceTokensCollection.doc(token).set({
            token: token,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`✅ Device token registered: ${token}`);
        return { success: true };
    } catch (error) {
        console.error("❌ Error registering device token:", error);
        return { success: false, error: error.message };
    }
}

// Send FCM push notification to all registered devices
async function sendPushNotificationToAllDevices(message) {
    try {
        // Get all registered device tokens
        const snapshot = await deviceTokensCollection.get();
        const tokens = [];

        snapshot.forEach(doc => {
            tokens.push(doc.data().token);
        });

        if (tokens.length === 0) {
            console.log("⚠️ No device tokens registered yet");
            return;
        }

        console.log(`📱 Sending notifications to ${tokens.length} devices...`);

        // Split tokens into chunks of 500 (FCM limit)
        const chunkSize = 500;
        for (let i = 0; i < tokens.length; i += chunkSize) {
            const chunk = tokens.slice(i, i + chunkSize);

            // Use sendMulticast instead
            const response = await admin.messaging().sendEachForMulticast({
                tokens: chunk,
                notification: {
                    title: "🚨 RCB vs CSK Match Alert!",
                    body: "Booking is now open for the RCB vs Chennai Super Kings!"
                },
                data: {
                    type: "BOOKING_OPENED",
                    matchDetails: "RCB vs CSK"
                }
            });

            console.log(`✅ Batch ${Math.floor(i / chunkSize) + 1}: Sent ${response.successCount} notifications successfully`);
            console.log(`❌ Batch ${Math.floor(i / chunkSize) + 1}: Failed to send ${response.failureCount} notifications`);

            // Log detailed failures if any
            if (response.failureCount > 0) {
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        console.error(`   Error for token at index ${idx}: ${resp.error.code} - ${resp.error.message}`);
                    }
                });
            }
        }
    } catch (error) {
        console.error("❌ Error sending notifications:", error);
    }
}

// Fetch data from API and check condition
async function fetchData() {
    try {
        const response = await axios.get(API_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            },
        });
        const data = response.data;
        console.log("🔍 Data fetched successfully");

        // Check for the condition in the data
        let bookingOpened = false;
        if (data.result) {
            for (const evt of data.result) {
                if (evt.team_2 === "Chennai Super Kings" && evt.event_Button_Text === "BUY TICKETS") {
                    bookingOpened = true;
                    break;
                }
            }
        }

        // If the condition is met, send a push notification to all devices
        if (bookingOpened) {
            sendPushNotificationToAllDevices("Booking for RCB vs RR match is now open!");
        }
    } catch (error) {
        console.error("❌ Error fetching data:", error);
    }
}

// Setup Express server
const app = express();
app.use(express.json());

// Add a simple ping endpoint for testing connectivity
app.get('/ping', (req, res) => {
    res.json({
        success: true,
        message: 'Server is reachable!',
        timestamp: new Date().toISOString()
    });
});

// Endpoint to register device tokens
app.post('/register-device', async (req, res) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({ success: false, error: 'Token is required' });
    }

    const result = await registerDeviceToken(token);
    res.json(result);
});

// Start the server - Make sure to bind to all network interfaces
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

// === Polling Loop ===
// Schedule the API call to run at intervals
cron.schedule(`*/${INTERVAL_SECONDS} * * * * *`, () => {
    console.log(`📡 Fetching data from ${API_URL}...`);
    fetchData();
});

console.log(`📡 Polling API every ${INTERVAL_SECONDS} seconds...`);