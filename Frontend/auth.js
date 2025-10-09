// Firebase Authentication Handler
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

const firebaseConfig = {
  apiKey: FIREBASE_API_KEY,
  authDomain: FIREBASE_AUTH_DOMAIN,
  projectId: FIREBASE_PROJECT_ID,
  storageBucket: FIREBASE_STORAGE_BUCKET,
  messagingSenderId: FIREBASE_MESSAGING_SENDER_ID,
  appId: FIREBASE_APP_ID,
  measurementId: MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Global variable to store current token
let currentIdToken = null;

// Get ID Token
export async function getIdToken() {
    const user = auth.currentUser;
    if (user) {
        try {
            currentIdToken = await user.getIdToken(true);
            return currentIdToken;
        } catch (error) {
            console.error('Error getting ID token:', error);
            throw error;
        }
    }
    return null;
}

// Sign Up
export async function signUp(email, password) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        console.log('User created:', userCredential.user.email);
        return { success: true, user: userCredential.user };
    } catch (error) {
        console.error('Sign up error:', error.code, error.message);
        return { success: false, error: error.message };
    }
}

// Sign In
export async function signIn(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        console.log('User signed in:', userCredential.user.email);
        // Get and store the ID token
        await getIdToken();
        return { success: true, user: userCredential.user };
    } catch (error) {
        console.error('Sign in error:', error.code, error.message);
        return { success: false, error: error.message };
    }
}

// Sign Out
export async function signOutUser() {
    try {
        await signOut(auth);
        currentIdToken = null;
        console.log('User signed out');
        return { success: true };
    } catch (error) {
        console.error('Sign out error:', error);
        return { success: false, error: error.message };
    }
}

// Auth State Observer
export function onAuthStateChange(callback) {
    return onAuthStateChanged(auth, async (user) => {
        if (user) {
            // User is signed in
            await getIdToken(); // Refresh token
            callback({ signedIn: true, user: user });
        } else {
            // User is signed out
            currentIdToken = null;
            callback({ signedIn: false, user: null });
        }
    });
}

// Export auth instance
export { auth };
