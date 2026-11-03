const { randomUUID } = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const {
    FieldValue,
    AggregateField,
    getFirestore
} = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const {
    defaultSurveys,
    DEFAULT_REWARD_CENTS,
    PAID_SURVEY_ACTIVATION_PRICE_CENTS
} = require("./src/defaultSurveys");
const {
    validateQuestionSet,
    validateAnswers,
    getNextAttempt,
    getSurveyRewardId
} = require("./src/validation");

initializeApp();
const db = getFirestore();

function requireUser(request) {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Sign in to access surveys.");
    }
    return request.auth.uid;
}

function requireAdmin(request) {
    const uid = requireUser(request);
    if (request.auth.token.admin !== true) {
        throw new HttpsError("permission-denied", "Administrator access is required.");
    }
    return uid;
}

function validSurveyId(surveyId) {
    return typeof surveyId === "string"
        && surveyId.length > 0
        && surveyId.length <= 120
        && /^[a-zA-Z0-9_-]+$/.test(surveyId);
}

function cleanSurvey(surveyId, data) {
    return {
        surveyId,
        title: data.title,
        description: data.description,
        access: data.access,
        active: data.active === true,
        rewardCents: data.rewardCents,
        allowRetakes: data.allowRetakes === true,
        questionCount: 10,
        createdAt: data.createdAt?.toDate?.().toISOString() || null,
        updatedAt: data.updatedAt?.toDate?.().toISOString() || null
    };
}

function cleanSubmission(document) {
    const data = document.data();
    return {
        submissionId: document.id,
        userId: data.userId,
        surveyId: data.surveyId,
        surveyAccess: data.surveyAccess,
        surveyTitle: data.surveyTitle,
        attempt: data.attempt,
        questionSnapshot: data.questionSnapshot || [],
        answers: data.answers,
        status: data.status,
        rewardCents: data.rewardCents,
        reviewNote: data.reviewNote || "",
        createdAt: data.createdAt?.toDate?.().toISOString() || null,
        reviewedAt: data.reviewedAt?.toDate?.().toISOString() || null
    };
}

function validateSurveyInput(data) {
    if (!data || typeof data !== "object"
        || typeof data.title !== "string"
        || data.title.trim().length < 3
        || data.title.trim().length > 120
        || typeof data.description !== "string"
        || data.description.trim().length > 1000
        || !["free", "paid"].includes(data.access)
        || typeof data.active !== "boolean"
        || typeof data.allowRetakes !== "boolean"
        || !Number.isInteger(data.rewardCents)
        || data.rewardCents < 0
        || data.rewardCents > 1000000) {
        throw new HttpsError("invalid-argument", "Survey details are invalid.");
    }

    try {
        return validateQuestionSet(data.questions);
    } catch (error) {
        throw new HttpsError("invalid-argument", error.message);
    }
}

async function getSurveyQuestions(surveyId) {
    const snapshot = await db.collection("surveyQuestions")
        .where("surveyId", "==", surveyId)
        .limit(11)
        .get();
    try {
        return validateQuestionSet(snapshot.docs.map((document) => document.data()));
    } catch (error) {
        throw new HttpsError("failed-precondition", error.message);
    }
}

async function hasPaidAccess(uid, surveyId) {
    const entitlement = await db.doc(`users/${uid}/paidSurveyAccess/${surveyId}`).get();
    return entitlement.exists && entitlement.get("active") === true;
}

async function ensureDefaultSurveys(createdBy) {
    let created = 0;
    for (const survey of defaultSurveys) {
        const surveyRef = db.doc(`surveys/${survey.surveyId}`);
        const wasCreated = await db.runTransaction(async (transaction) => {
            const existing = await transaction.get(surveyRef);
            if (existing.exists) return false;

            const questions = validateQuestionSet(survey.questions);
            transaction.create(surveyRef, {
                title: survey.title,
                description: survey.description,
                access: "free",
                active: true,
                rewardCents: DEFAULT_REWARD_CENTS,
                allowRetakes: false,
                questionCount: 10,
                createdBy,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
            });
            for (const question of questions) {
                transaction.create(db.doc(`surveyQuestions/${survey.surveyId}_${question.order}`), {
                    ...question,
                    surveyId: survey.surveyId
                });
            }
            return true;
        });
        if (wasCreated) created += 1;
    }
    return created;
}

async function ensurePlatformSettings() {
    const settingsRef = db.doc("adminSettings/platform");
    await db.runTransaction(async (transaction) => {
        const settings = await transaction.get(settingsRef);
        if (settings.exists) return;
        transaction.create(settingsRef, {
            paidSurveyActivationPriceCents: PAID_SURVEY_ACTIVATION_PRICE_CENTS,
            defaultSurveyRewardCents: DEFAULT_REWARD_CENTS,
            paymentProviderConfigured: false,
            paidSurveyActivationEnabled: false,
            rewardFundingVerified: false,
            payoutsEnabled: false,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        });
    });
}

exports.getSurveyDashboard = onCall(async (request) => {
    const uid = requireUser(request);
    await Promise.all([ensureDefaultSurveys("system"), ensurePlatformSettings()]);
    const [surveysSnapshot, submissionsSnapshot, accessSnapshot, earningsSnapshot] = await Promise.all([
        db.collection("surveys").where("active", "==", true).limit(200).get(),
        db.collection("surveySubmissions").where("userId", "==", uid).limit(100).get(),
        db.collection(`users/${uid}/paidSurveyAccess`).where("active", "==", true).limit(200).get(),
        db.collection("earnings").where("userId", "==", uid).limit(500).get()
    ]);

    const submissions = submissionsSnapshot.docs.map(cleanSubmission);
    const submissionsBySurvey = new Map();
    for (const submission of submissions) {
        const surveySubmissions = submissionsBySurvey.get(submission.surveyId) || [];
        surveySubmissions.push(submission);
        submissionsBySurvey.set(submission.surveyId, surveySubmissions);
    }
    const paidAccess = new Set(accessSnapshot.docs.map((document) => document.id));
    const surveys = surveysSnapshot.docs.map((document) => cleanSurvey(document.id, document.data()))
        .map((survey) => {
            const previous = submissionsBySurvey.get(survey.surveyId) || [];
            return {
                ...survey,
                locked: survey.access === "paid" && !paidAccess.has(survey.surveyId),
                attempted: previous.some((submission) => submission.status === "pending")
                    || (previous.length > 0 && survey.allowRetakes !== true),
                lastSubmissionStatus: previous
                    .sort((a, b) => b.attempt - a.attempt)[0]?.status || null
            };
        });

    const completed = submissions.filter((submission) => submission.status === "approved"
        || submission.status === "rejected");
    const pending = submissions.filter((submission) => submission.status === "pending");
    const approvedCents = earningsSnapshot.docs
        .filter((document) => document.get("status") === "available")
        .reduce((sum, document) => sum + document.get("amountCents"), 0);

    return {
        surveys,
        submissions: submissions.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")),
        stats: {
            availableSurveys: surveys.filter((survey) => !survey.locked && !survey.attempted).length,
            freeCompleted: completed.filter((submission) => submission.surveyAccess === "free").length,
            paidCompleted: completed.filter((submission) => submission.surveyAccess === "paid").length,
            lockedSurveys: surveys.filter((survey) => survey.locked).length,
            pendingRewardsCents: pending.reduce((sum, submission) => sum + submission.rewardCents, 0),
            approvedEarningsCents: approvedCents,
            withdrawableCents: 0
        },
        paidActivationEnabled: false,
        paidActivationPriceCents: PAID_SURVEY_ACTIVATION_PRICE_CENTS,
        rewardDisclosure: "Survey rewards are proposed and remain pending until an administrator verifies the submission and available funding. Payouts are not enabled."
    };
});

exports.getSurveyQuestions = onCall(async (request) => {
    const uid = requireUser(request);
    const surveyId = request.data?.surveyId;
    if (!validSurveyId(surveyId)) {
        throw new HttpsError("invalid-argument", "A valid survey ID is required.");
    }

    const surveyDocument = await db.doc(`surveys/${surveyId}`).get();
    if (!surveyDocument.exists || surveyDocument.get("active") !== true) {
        throw new HttpsError("not-found", "This survey is not available.");
    }
    const survey = cleanSurvey(surveyDocument.id, surveyDocument.data());
    if (survey.access === "paid" && !(request.auth.token.admin === true
        || await hasPaidAccess(uid, surveyId))) {
        throw new HttpsError("permission-denied", "This survey is locked until paid access is verified.");
    }

    const questions = await getSurveyQuestions(surveyId);
    if (questions.length !== 10) {
        throw new HttpsError("failed-precondition", "This survey is not configured correctly.");
    }
    return { survey, questions };
});

exports.submitSurvey = onCall(async (request) => {
    const uid = requireUser(request);
    const { surveyId, answers } = request.data || {};
    if (!validSurveyId(surveyId)) {
        throw new HttpsError("invalid-argument", "A valid survey ID is required.");
    }

    const surveyRef = db.doc(`surveys/${surveyId}`);
    const surveyDocument = await surveyRef.get();
    if (!surveyDocument.exists || surveyDocument.get("active") !== true) {
        throw new HttpsError("not-found", "This survey is not available.");
    }
    const survey = surveyDocument.data();
    if (survey.access === "paid" && !(request.auth.token.admin === true
        || await hasPaidAccess(uid, surveyId))) {
        throw new HttpsError("permission-denied", "This survey is locked until paid access is verified.");
    }

    const questions = await getSurveyQuestions(surveyId);
    if (questions.length !== 10) {
        throw new HttpsError("failed-precondition", "This survey is not configured correctly.");
    }

    let validatedAnswers;
    try {
        validatedAnswers = validateAnswers(questions, answers);
    } catch (error) {
        throw new HttpsError("invalid-argument", error.message);
    }

    const progressRef = db.doc(`surveyProgress/${uid}_${surveyId}`);
    const submissionId = await db.runTransaction(async (transaction) => {
        const progress = await transaction.get(progressRef);
        const progressData = progress.exists ? progress.data() : {};

        if (progressData.pendingSubmissionId) {
            throw new HttpsError("already-exists", "Your submission is awaiting review.");
        }
        let attempt;
        try {
            attempt = getNextAttempt(progressData, survey.allowRetakes === true);
        } catch (error) {
            throw new HttpsError("already-exists", error.message);
        }

        const nextId = `${uid}_${surveyId}_${attempt}`;
        const submissionRef = db.doc(`surveySubmissions/${nextId}`);
        transaction.create(submissionRef, {
            userId: uid,
            surveyId,
            surveyAccess: survey.access,
            surveyTitle: survey.title,
            attempt,
            questionSnapshot: questions,
            answers: validatedAnswers,
            status: "pending",
            rewardCents: survey.rewardCents,
            createdAt: FieldValue.serverTimestamp()
        });
        transaction.set(progressRef, {
            userId: uid,
            surveyId,
            attemptCount: attempt,
            pendingSubmissionId: nextId,
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        return nextId;
    });

    return {
        submissionId,
        status: "pending",
        message: "Your responses were submitted for review. Rewards are not credited until approved."
    };
});

exports.seedDefaultSurveys = onCall(async (request) => {
    const uid = requireAdmin(request);
    const created = await ensureDefaultSurveys(uid);
    return { created, total: defaultSurveys.length };
});

exports.adminGetSurvey = onCall(async (request) => {
    requireAdmin(request);
    const surveyId = request.data?.surveyId;
    if (!validSurveyId(surveyId)) {
        throw new HttpsError("invalid-argument", "Survey ID is required.");
    }
    const snapshot = await db.doc(`surveys/${surveyId}`).get();
    if (!snapshot.exists) throw new HttpsError("not-found", "Survey not found.");
    return {
        survey: cleanSurvey(snapshot.id, snapshot.data()),
        questions: await getSurveyQuestions(snapshot.id)
    };
});

exports.adminSaveSurvey = onCall(async (request) => {
    const uid = requireAdmin(request);
    const data = request.data || {};
    const questions = validateSurveyInput(data);
    const surveyId = typeof data.surveyId === "string" && data.surveyId
        ? data.surveyId
        : randomUUID();
    if (surveyId.length > 120 || !/^[a-zA-Z0-9_-]+$/.test(surveyId)) {
        throw new HttpsError("invalid-argument", "Survey ID is invalid.");
    }

    const surveyRef = db.doc(`surveys/${surveyId}`);
    const existing = await surveyRef.get();
    const batch = db.batch();
    batch.set(surveyRef, {
        title: data.title.trim(),
        description: data.description.trim(),
        access: data.access,
        active: data.active,
        allowRetakes: data.allowRetakes,
        rewardCents: data.rewardCents,
        questionCount: 10,
        createdBy: existing.exists ? existing.get("createdBy") : uid,
        createdAt: existing.exists ? existing.get("createdAt") : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
    });

    const oldQuestions = await db.collection("surveyQuestions")
        .where("surveyId", "==", surveyId)
        .get();
    const newQuestionIds = new Set(questions.map((question) => `${surveyId}_${question.order}`));
    for (const document of oldQuestions.docs) {
        if (!newQuestionIds.has(document.id)) batch.delete(document.ref);
    }
    for (const question of questions) {
        batch.set(db.doc(`surveyQuestions/${surveyId}_${question.order}`), {
            ...question,
            surveyId
        });
    }
    await batch.commit();
    return { surveyId };
});

exports.adminDeactivateSurvey = onCall(async (request) => {
    const uid = requireAdmin(request);
    const surveyId = request.data?.surveyId;
    if (!validSurveyId(surveyId)) {
        throw new HttpsError("invalid-argument", "Survey ID is required.");
    }
    const surveyRef = db.doc(`surveys/${surveyId}`);
    const snapshot = await surveyRef.get();
    if (!snapshot.exists) throw new HttpsError("not-found", "Survey not found.");
    await surveyRef.update({
        active: false,
        deactivatedBy: uid,
        updatedAt: FieldValue.serverTimestamp()
    });
    return { surveyId, active: false };
});

exports.adminListSurveys = onCall(async (request) => {
    requireAdmin(request);
    const surveys = await db.collection("surveys").limit(200).get();
    return {
        surveys: surveys.docs.map((document) => cleanSurvey(document.id, document.data()))
    };
});

exports.adminReviewSubmission = onCall(async (request) => {
    const uid = requireAdmin(request);
    const { submissionId, decision, reviewNote = "" } = request.data || {};
    if (typeof submissionId !== "string"
        || !["approved", "rejected"].includes(decision)
        || typeof reviewNote !== "string"
        || reviewNote.length > 1000) {
        throw new HttpsError("invalid-argument", "Review details are invalid.");
    }

    const submissionRef = db.doc(`surveySubmissions/${submissionId}`);
    const progressRefBase = db;
    await db.runTransaction(async (transaction) => {
        const submissionDocument = await transaction.get(submissionRef);
        if (!submissionDocument.exists) throw new HttpsError("not-found", "Submission not found.");
        const submission = submissionDocument.data();
        if (submission.status !== "pending") {
            throw new HttpsError("failed-precondition", "This submission has already been reviewed.");
        }

        const earningRef = db.doc(`earnings/${getSurveyRewardId(submission.userId, submission.surveyId)}`);
        const earning = await transaction.get(earningRef);
        if (decision === "approved" && earning.exists) {
            throw new HttpsError("already-exists", "A reward has already been recorded for this submission.");
        }

        const progressRef = progressRefBase.doc(`surveyProgress/${submission.userId}_${submission.surveyId}`);
        const progress = await transaction.get(progressRef);
        transaction.update(submissionRef, {
            status: decision,
            reviewNote: reviewNote.trim(),
            reviewedBy: uid,
            reviewedAt: FieldValue.serverTimestamp()
        });
        if (progress.exists && progress.get("pendingSubmissionId") === submissionId) {
            transaction.update(progressRef, {
                pendingSubmissionId: FieldValue.delete(),
                lastStatus: decision,
                updatedAt: FieldValue.serverTimestamp()
            });
        }

        if (decision === "approved") {
            transaction.create(earningRef, {
                userId: submission.userId,
                submissionId,
                surveyId: submission.surveyId,
                amountCents: submission.rewardCents,
                status: "available",
                createdAt: FieldValue.serverTimestamp(),
                approvedBy: uid
            });
        }
    });

    return { submissionId, status: decision };
});

exports.adminDashboard = onCall(async (request) => {
    requireAdmin(request);
    const [users, pending, payments, earnings] = await Promise.all([
        db.collection("users").orderBy("createdAt", "desc").limit(200).get(),
        db.collection("surveySubmissions").where("status", "==", "pending").limit(100).get(),
        db.collection("transactions").orderBy("createdAt", "desc").limit(200).get(),
        db.collection("earnings").where("status", "==", "available")
            .aggregate({ totalCents: AggregateField.sum("amountCents") }).get()
    ]);

    return {
        users: users.docs.map((document) => ({
            uid: document.id,
            fullName: document.get("fullName") || "",
            email: document.get("email") || "",
            phone: document.get("phone") || "",
            accountStatus: document.get("accountStatus") || "registered"
        })),
        pendingSubmissions: pending.docs.map(cleanSubmission),
        paymentTransactions: payments.docs.map((document) => ({
            transactionId: document.id,
            userId: document.get("userId") || "",
            type: document.get("type") || "",
            status: document.get("status") || "",
            amountCents: document.get("amountCents") || 0,
            provider: document.get("provider") || "",
            createdAt: document.get("createdAt")?.toDate?.().toISOString() || null
        })),
        totalRewardLiabilityCents: earnings.data().totalCents || 0,
        paymentProviderConfigured: false,
        payoutsEnabled: false
    };
});
