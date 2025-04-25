require("dotenv").config()

const admin = require('firebase-admin');

// Initialize Firebase Admin with the service account key
const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

module.exports = admin;
