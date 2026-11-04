import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";

import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    reload,
    browserLocalPersistence,
    setPersistence,
    onAuthStateChanged,
    sendPasswordResetEmail,
    verifyPasswordResetCode,
    confirmPasswordReset
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

import {
    getFirestore,
    doc,
    getDoc,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

import { getFunctions } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-functions.js";

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
export const functions = getFunctions(app, "us-central1");
export {
    sendPasswordResetEmail,
    verifyPasswordResetCode,
    confirmPasswordReset
};

export function getUserProfile(uid) {
    return getDoc(doc(db, "users", uid));
}

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

function makeUserProfile(user, fullName, email, phoneNumber) {
    return {
        uid: user.uid,
        fullName: fullName.trim(),
        email: user.email || email,
        phoneNumber,
        createdAt: serverTimestamp(),
        accountStatus: "registered",
        role: "user"
    };
}

function profileSaveError(error) {
    const wrappedError = new Error(
        "Firebase Authentication succeeded, but the Firestore user profile could not be saved.",
        { cause: error }
    );
    wrappedError.code = error.code || "firestore/unknown";
    wrappedError.registrationStage = "profile";
    return wrappedError;
}

async function ensureUserProfile(user, fullName, email, phoneNumber) {
    const profileRef = doc(db, "users", user.uid);
    try {
        await runTransaction(db, async (transaction) => {
            const existingProfile = await transaction.get(profileRef);
            if (!existingProfile.exists()) {
                transaction.set(
                    profileRef,
                    makeUserProfile(user, fullName, email, phoneNumber)
                );
                return;
            }

            const profile = existingProfile.data();
            const missingFields = {};
            if (!Object.prototype.hasOwnProperty.call(profile, "phoneNumber")) {
                missingFields.phoneNumber = phoneNumber;
            }
            if (!Object.prototype.hasOwnProperty.call(profile, "role")) {
                missingFields.role = "user";
            }
            if (Object.keys(missingFields).length > 0) {
                transaction.update(profileRef, missingFields);
            }
        });
    } catch (error) {
        throw profileSaveError(error);
    }
}

export async function recoverUserProfile(fullName, email, phone) {
    const user = auth.currentUser;
    const normalizedEmail = email.trim().toLowerCase();
    if (!user || user.email?.toLowerCase() !== normalizedEmail) {
        throw new Error("Sign in with the account email before recovering its profile.");
    }

    await ensureUserProfile(
        user,
        fullName,
        normalizedEmail,
        normalizeKenyanPhoneNumber(phone)
    );
    return user;
}

export async function registerUser(fullName, email, phone, password) {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = normalizeKenyanPhoneNumber(phone);

    await setPersistence(auth, browserLocalPersistence);

    let user;
    try {
        ({ user } = await createUserWithEmailAndPassword(
            auth,
            normalizedEmail,
            password
        ));
    } catch (error) {
        if (error.code !== "auth/email-already-in-use") {
            throw error;
        }

        try {
            ({ user } = await signInWithEmailAndPassword(
                auth,
                normalizedEmail,
                password
            ));
        } catch (signInError) {
            if (signInError.code === "auth/invalid-credential"
                || signInError.code === "auth/wrong-password"
                || signInError.code === "auth/user-not-found") {
                const duplicateError = new Error(
                    "An account already exists for this email. Sign in with its password or reset that password.",
                    { cause: signInError }
                );
                duplicateError.code = "auth/email-already-in-use";
                throw duplicateError;
            }
            throw signInError;
        }
    }

    await ensureUserProfile(user, fullName, normalizedEmail, normalizedPhone);
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
        profile = await getUserProfile(user.uid);
    } catch (error) {
        await signOut(auth);
        const profileError = new Error(
            "Unable to load your account profile. Check Firestore access and try again.",
            { cause: error }
        );
        profileError.code = error.code || "firestore/unknown";
        throw profileError;
    }

    if (!profile.exists()) {
        await signOut(auth);
        const missingProfileError = new Error(
            "Your account is signed in, but its profile is missing. Open registration and submit your details with the same email and password to repair it."
        );
        missingProfileError.code = "app/missing-user-profile";
        throw missingProfileError;
    }

    return user;
}

export async function logoutUser() {
    await signOut(auth);
}

export { onAuthStateChanged };
