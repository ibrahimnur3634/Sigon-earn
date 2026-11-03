
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";

import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    sendEmailVerification,
    reload,
    RecaptchaVerifier,
    linkWithPhoneNumber,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    updateDoc,
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

let recaptchaVerifier = null;

// CREATE RECAPTCHA
function getRecaptcha() {
    if (!recaptchaVerifier) {
        recaptchaVerifier = new RecaptchaVerifier(
            auth,
            "recaptcha-container",
            {
                size: "normal"
            }
        );
    }

    return recaptchaVerifier;
}

// REGISTER USER AND SEND VERIFICATION EMAIL + PHONE OTP
export async function registerUser(fullName, email, phone, password) {

    const result = await createUserWithEmailAndPassword(
        auth,
        email,
        password
    );

    try {
        await sendEmailVerification(result.user);

        const verifier = getRecaptcha();

        const confirmation = await linkWithPhoneNumber(
            result.user,
            phone,
            verifier
        );

        return {
            user: result.user,
            confirmation
        };

    } catch (error) {
        if (recaptchaVerifier) {
            await recaptchaVerifier.clear();
            recaptchaVerifier = null;
        }

        throw error;
    }
}

// VERIFY PHONE OTP AND SAVE USER PROFILE
export async function verifyRegistrationOTP(
    confirmation,
    code,
    fullName,
    email,
    phone
) {

    const result = await confirmation.confirm(code);

    const user = result.user;

    await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        fullName: fullName,
        email: email,
        phone: phone,
        phoneVerified: true,
        emailVerified: user.emailVerified,
        accountStatus: "pending_email_verification",
        createdAt: serverTimestamp()
    });

    if (recaptchaVerifier) {
        await recaptchaVerifier.clear();
        recaptchaVerifier = null;
    }

    return user;
}

// LOGIN USER
export async function loginUser(email, password) {

    const result = await signInWithEmailAndPassword(
        auth,
        email,
        password
    );

    await reload(result.user);
    await result.user.getIdToken(true);

    const profileRef = doc(db, "users", result.user.uid);
    const profile = await getDoc(profileRef);

    if (!profile.exists() || !result.user.phoneNumber) {
        await signOut(auth);
        throw new Error("Your phone verification or account profile is missing.");
    }

    if (!result.user.emailVerified) {
        await signOut(auth);
        throw new Error("Please verify your email before logging in.");
    }

    await updateDoc(profileRef, {
        emailVerified: true,
        accountStatus: "active"
    });

    return result.user;
}

// LOGOUT
export async function logoutUser() {
    await signOut(auth);
}

// AUTHENTICATION LISTENER
export { onAuthStateChanged };
