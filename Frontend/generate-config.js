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

// Debug logging
console.log('🔧 Generating config.js...');
console.log('📁 Current directory:', __dirname);
console.log('📝 Firebase config:', JSON.stringify(firebaseConfig, null, 2));

// Check if any values are missing
const missingVars = Object.entries(firebaseConfig)
    .filter(([key, value]) => !value)
    .map(([key]) => key);

if (missingVars.length > 0) {
    console.error('❌ MISSING ENVIRONMENT VARIABLES:', missingVars);
    console.log('Available environment variables:', Object.keys(process.env).filter(k => k.includes('FIREBASE') || k.includes('VERCEL')));
}

// Generate config.js content
const configContent = `// Firebase configuration - Auto-generated during build
window.firebaseConfig = ${JSON.stringify(firebaseConfig, null, 2)};
console.log('✅ Firebase config loaded successfully');
`;

// Write to same directory (Frontend/)
const outputPath = path.join(__dirname, 'config.js');

try {
    fs.writeFileSync(outputPath, configContent, 'utf8');
    console.log('✅ config.js written to:', outputPath);
    console.log('📦 File size:', fs.statSync(outputPath).size, 'bytes');
} catch (error) {
    console.error('❌ Failed to write config.js:', error.message);
    process.exit(1);
}
