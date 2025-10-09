const fs = require('fs');
const path = require('path');

// Read environment variables
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || '',
    measurementId: process.env.MEASUREMENT_ID || ''
};

// Generate config.js content
const configContent = `// Firebase configuration - Auto-generated during build
window.firebaseConfig = ${JSON.stringify(firebaseConfig, null, 2)};
console.log('Firebase config loaded');
`;

// Write to Frontend/config.js
const outputPath = path.join(__dirname, 'Frontend', 'config.js');
fs.writeFileSync(outputPath, configContent, 'utf8');

console.log('✅ config.js generated successfully at:', outputPath);
console.log('Config:', firebaseConfig);
