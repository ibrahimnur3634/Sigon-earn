const { applicationDefault, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

async function main() {
    const [projectId, email, action] = process.argv.slice(2);
    if (!projectId || !email || !["grant", "revoke"].includes(action)) {
        throw new Error("Usage: node scripts/grant-admin.js <project-id> <email> <grant|revoke>");
    }

    initializeApp({
        credential: applicationDefault(),
        projectId
    });

    const auth = getAuth();
    const user = await auth.getUserByEmail(email);
    if (action === "grant" && !user.emailVerified) {
        throw new Error("Verify this account's email before granting administrator access.");
    }

    const claims = { ...(user.customClaims || {}) };
    if (action === "grant") claims.admin = true;
    else delete claims.admin;

    await auth.setCustomUserClaims(user.uid, claims);
    console.log(`${action === "grant" ? "Granted" : "Revoked"} administrator access for ${user.email}.`);
    console.log("The user must sign out and sign in again to refresh their ID token.");
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
