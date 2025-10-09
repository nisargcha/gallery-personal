// Firebase Authentication Handler
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { GoogleAuthProvider, signInWithPopup } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// Wait for config to load from config.js
function getFirebaseConfig() {
    if (typeof window.firebaseConfig !== 'undefined') {
        return window.firebaseConfig;
    }
    
    // Fallback if config.js didn't load
    console.error('Firebase config not found! Make sure config.js is loaded before auth.js');
    return {
        apiKey: "MISSING",
        authDomain: "MISSING",
        projectId: "MISSING",
        storageBucket: "MISSING",
        messagingSenderId: "MISSING",
        appId: "MISSING"
    };
}

// Initialize Firebase
const firebaseConfig = getFirebaseConfig();
console.log('Initializing Firebase with config:', firebaseConfig);

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
            await getIdToken();
            callback({ signedIn: true, user: user });
        } else {
            currentIdToken = null;
            callback({ signedIn: false, user: null });
        }
    });
}
export async function signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        console.log('User signed in with Google:', user.email);
        await getIdToken();
        return { success: true, user: user };
    } catch (error) {
        console.error('Google sign in error:', error.code, error.message);
        return { success: false, error: error.message };
    }
}   
export { auth };
