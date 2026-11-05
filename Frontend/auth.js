// Firebase Authentication Handler
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

function getFirebaseConfig() {
    if (typeof window.firebaseConfig !== 'undefined') {
        return window.firebaseConfig;
    }
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

const app = initializeApp(getFirebaseConfig());
const auth = getAuth(app);

// Returns a valid ID token. Firebase caches it and refreshes automatically
// when it is close to expiry, so no forced refresh is needed.
export async function getIdToken() {
    const user = auth.currentUser;
    if (!user) return null;
    try {
        return await user.getIdToken();
    } catch (error) {
        console.error('Error getting ID token');
        throw error;
    }
}

export async function signUp(email, password) {
    try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        return { success: true, user: cred.user };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export async function signIn(email, password) {
    try {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        return { success: true, user: cred.user };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export async function signOutUser() {
    try {
        await signOut(auth);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export function onAuthStateChange(callback) {
    return onAuthStateChanged(auth, (user) => {
        callback({ signedIn: !!user, user: user || null });
    });
}

export async function signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        return { success: true, user: result.user };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export { auth };