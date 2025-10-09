// Frontend/generate-config.js
const fs = require('fs');

const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || '',
    measurementId: process.env.MEASUREMENT_ID || ''
};

console.log('🔧 Building config.js in Frontend directory');
const configContent = `window.firebaseConfig = ${JSON.stringify(firebaseConfig, null, 2)};`;
fs.writeFileSync('./config.js', configContent, 'utf8');
console.log('✅ config.js created');
