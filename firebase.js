import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";

import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    deleteUser,
    reload,
    browserLocalPersistence,
    setPersistence,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

// FIREBASE CONFIGURATION
const firebaseConfig = {
    apiKey: "AIzaSyCoAGWe4zoN4dCyQWtouye_XVJ04yZBLhw",
    authDomain: "sigon-earn.firebaseapp.com",
    projectId: "sigon-earn",
    storageBucket: "sigon-earn.firebasestorage.app",
    messagingSenderId: "169686522677",
    appId: "1:169686522677:web:787e0084b11e640d840a7c",
    measurementId: "G-D5DF7QNB17"
};

// INITIALIZE FIREBASE
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export function normalizeKenyanPhoneNumber(phone) {
    const digits = phone.replace(/[\s()-]/g, "");
    let normalized = digits;

    if (/^0[17]\d{8}$/.test(digits)) {
        normalized = `+254${digits.slice(1)}`;
    } else if (/^254[17]\d{8}$/.test(digits)) {
        normalized = `+${digits}`;
    }

    if (!/^\+254[17]\d{8}$/.test(normalized)) {
        throw new Error("Enter a valid Kenyan mobile number, such as +254712345678.");
    }

    return normalized;
}

export async function registerUser(fullName, email, phone, password) {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = normalizeKenyanPhoneNumber(phone);

    await setPersistence(auth, browserLocalPersistence);

    const { user } = await createUserWithEmailAndPassword(
        auth,
        normalizedEmail,
        password
    );

    try {
        await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            fullName: fullName.trim(),
            email: normalizedEmail,
            phone: normalizedPhone,
            phoneVerified: false,
            emailVerified: user.emailVerified,
            accountStatus: "registered",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        }, { merge: true });
    } catch (error) {
        try {
            await deleteUser(user);
        } catch (cleanupError) {
            await signOut(auth);
            throw new Error(
                "Your account was created, but its profile could not be saved or automatically removed. Please contact support.",
                { cause: cleanupError }
            );
        }

        throw new Error(
            "Your profile could not be saved, so registration was cancelled. Please try again.",
            { cause: error }
        );
    }

    return user;
}

export async function loginUser(email, password) {
    await setPersistence(auth, browserLocalPersistence);

    const { user } = await signInWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        password
    );

    try {
        await reload(user);
        await user.getIdToken(true);
    } catch (error) {
        await signOut(auth);
        throw error;
    }

    let profile;
    try {
        profile = await getDoc(doc(db, "users", user.uid));
    } catch (error) {
        await signOut(auth);
        throw new Error(
            "Unable to load your account profile. Check Firestore access and try again.",
            { cause: error }
        );
    }

    if (!profile.exists()) {
        await signOut(auth);
        throw new Error("Your account profile is missing. Please contact support.");
    }

    return user;
}

export async function logoutUser() {
    await signOut(auth);
}

export { onAuthStateChanged };
