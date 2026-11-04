import { auth, db, logoutUser, onAuthStateChanged } from "./firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";
import {
    adminDashboard,
    adminDeactivateSurvey,
    adminGetSurvey,
    adminListSurveys,
    adminReviewSubmission,
    adminSaveSurvey,
    getSurveyDashboard,
    getSurveyQuestions,
    seedDefaultSurveys,
    submitSurvey
} from "./surveyService.js";

const byId = (id) => document.getElementById(id);
const money = (cents) => new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
}).format((cents || 0) / 100);
const readableError = (error) => error?.message || "Something went wrong. Please try again.";
let currentSurvey = null;
let currentQuestions = [];
let isAdmin = false;

function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function setMessage(element, message, isError = false) {
    element.textContent = message;
    element.style.color = isError ? "#b42318" : "";
}

async function loadAccount(user) {
    const snapshot = await getDoc(doc(db, "users", user.uid));
    if (!snapshot.exists()) {
        await logoutUser();
        window.location.replace("login.html");
        return false;
    }

    const profile = snapshot.data();
    byId("userName").textContent = profile.fullName || user.displayName || "User";
    byId("accountEmail").textContent = profile.email || user.email || "Not available";
    byId("phoneNumber").textContent = profile.phoneNumber || profile.phone || user.phoneNumber || "Not provided";
    byId("emailVerification").textContent = user.emailVerified ? "Verified" : "Not verified";
    byId("accountStatus").textContent = profile.accountStatus || "Registered";
    return true;
}

function renderSurveyCard(survey) {
    const card = makeElement("article", "survey-card");
    const title = makeElement("h3", "", survey.title);
    const retakeAvailable = !survey.locked && !survey.attempted
        && survey.lastSubmissionStatus && survey.allowRetakes;
    const status = survey.locked ? "locked"
        : survey.attempted && survey.lastSubmissionStatus === "pending" ? "pending"
            : survey.attempted && survey.lastSubmissionStatus === "approved" ? "completed"
                : survey.attempted && survey.lastSubmissionStatus === "rejected" ? "rejected"
                    : retakeAvailable ? "retake available" : "available";
    const badge = makeElement("span", `badge ${status === "completed" ? "approved" : status}`,
        status);
    const description = makeElement("p", "", survey.description || "");
    const details = makeElement("p", "survey-notice",
        `10 questions · ${survey.access === "free" ? "Free access" : "Paid access"} · ${money(survey.rewardCents)} proposed reward, subject to review`);
    const action = makeElement("button", "", survey.locked
        ? "Locked — Activate for $10"
        : survey.attempted ? "Already submitted"
            : retakeAvailable ? "Start another attempt" : "Start survey");

    card.append(title, badge, description, details);
    if (survey.locked) {
        action.disabled = true;
        const note = makeElement("p", "survey-notice", "Paid access is unavailable until a payment provider is configured and payments can be verified.");
        card.append(note);
    } else if (survey.attempted) {
        action.disabled = true;
    } else {
        action.addEventListener("click", () => openSurvey(survey));
    }
    card.append(action);
    return card;
}

function renderSurveyHistory(submissions) {
    const history = byId("surveyHistory");
    history.replaceChildren();
    if (!submissions.length) {
        history.append(makeElement("p", "survey-notice", "No survey submissions yet."));
        return;
    }

    for (const submission of submissions) {
        const item = makeElement("article", "history-item");
        item.append(
            makeElement("h3", "", submission.surveyTitle || "Survey"),
            makeElement("span", `badge ${submission.status}`, submission.status),
            makeElement("p", "", `Attempt ${submission.attempt} · Proposed reward: ${money(submission.rewardCents)}`),
            makeElement("p", "", submission.reviewNote || (submission.status === "pending"
                ? "Awaiting administrator review."
                : submission.status === "approved"
                    ? "Approved. Earnings are recorded in the ledger; payouts are not enabled."
                    : "This submission was not approved."))
        );
        history.append(item);
    }
}

function renderSurveyDashboard(data) {
    const stats = data.stats;
    byId("availableSurveys").textContent = String(stats.availableSurveys);
    byId("freeCompleted").textContent = String(stats.freeCompleted);
    byId("paidCompleted").textContent = String(stats.paidCompleted);
    byId("lockedSurveys").textContent = String(stats.lockedSurveys);
    byId("pendingRewards").textContent = money(stats.pendingRewardsCents);
    byId("approvedEarnings").textContent = money(stats.approvedEarningsCents);
    byId("withdrawableBalance").textContent = money(stats.withdrawableCents);
    byId("rewardDisclosure").textContent = data.rewardDisclosure;

    const list = byId("surveyList");
    list.replaceChildren();
    if (!data.surveys.length) {
        list.append(makeElement("p", "survey-notice", "No surveys are published yet."));
    } else {
        for (const survey of data.surveys) list.append(renderSurveyCard(survey));
    }
    renderSurveyHistory(data.submissions);
}

function questionLabel(question) {
    return `${question.order}. ${question.prompt}${question.required ? " *" : ""}`;
}

function renderQuestion(question) {
    const wrapper = makeElement("fieldset", "question-card");
    wrapper.dataset.order = String(question.order);
    wrapper.append(makeElement("legend", "", questionLabel(question)));

    if (question.type === "single" || question.type === "multiple") {
        for (const choice of question.choices) {
            const label = makeElement("label", "question-choice");
            const input = document.createElement("input");
            input.type = question.type === "single" ? "radio" : "checkbox";
            input.name = `question-${question.order}`;
            input.value = choice;
            label.append(input, document.createTextNode(choice));
            wrapper.append(label);
        }
    } else if (question.type === "rating") {
        const select = document.createElement("select");
        select.name = `question-${question.order}`;
        const placeholder = makeElement("option", "", "Choose a rating");
        placeholder.value = "";
        select.append(placeholder);
        for (let value = question.min; value <= question.max; value += 1) {
            const option = makeElement("option", "", String(value));
            option.value = String(value);
            select.append(option);
        }
        wrapper.append(select);
    } else {
        const textarea = document.createElement("textarea");
        textarea.name = `question-${question.order}`;
        textarea.maxLength = question.maxLength;
        textarea.placeholder = "Enter your answer";
        wrapper.append(textarea);
    }
    return wrapper;
}

function collectAnswers() {
    const answers = {};
    for (const question of currentQuestions) {
        const inputs = [...byId("surveyQuestions")
            .querySelectorAll(`[name="question-${question.order}"]`)];
        let answer;
        if (question.type === "multiple") {
            answer = inputs.filter((input) => input.checked).map((input) => input.value);
        } else if (question.type === "single") {
            answer = inputs.find((input) => input.checked)?.value;
        } else if (question.type === "rating") {
            const value = inputs[0]?.value;
            answer = value ? Number(value) : undefined;
        } else {
            answer = inputs[0]?.value.trim();
        }

        const answered = answer !== undefined && answer !== ""
            && (!Array.isArray(answer) || answer.length > 0);
        if (!answered && question.required) {
            throw new Error(`Please answer question ${question.order}.`);
        }
        if (answered) answers[String(question.order)] = answer;
    }
    return answers;
}

function updateSurveyProgress() {
    const answered = currentQuestions.filter((question) => {
        const inputs = [...byId("surveyQuestions")
            .querySelectorAll(`[name="question-${question.order}"]`)];
        if (question.type === "multiple" || question.type === "single") {
            return inputs.some((input) => input.checked);
        }
        return Boolean(inputs[0]?.value);
    }).length;
    byId("surveyProgress").value = answered;
    byId("progressText").textContent = `${answered} of ${currentQuestions.length} answered`;
}

async function openSurvey(survey) {
    const button = [...byId("surveyList").querySelectorAll("button")]
        .find((candidate) => candidate.textContent === "Start survey"
            && candidate.closest(".survey-card")?.querySelector("h3")?.textContent === survey.title);
    if (button) button.disabled = true;
    try {
        const result = await getSurveyQuestions(survey.surveyId);
        currentSurvey = result.survey;
        currentQuestions = result.questions;
        byId("activeSurveyTitle").textContent = currentSurvey.title;
        byId("activeSurveyDescription").textContent =
            `${currentSurvey.description || ""} Proposed reward: ${money(currentSurvey.rewardCents)} after review; no payout is enabled.`;
        const container = byId("surveyQuestions");
        container.replaceChildren(...currentQuestions.map(renderQuestion));
        byId("surveyMessage").textContent = "";
        byId("surveyForm").reset();
        byId("surveyRunner").hidden = false;
        byId("surveyRunner").scrollIntoView({ behavior: "smooth", block: "start" });
        updateSurveyProgress();
    } catch (error) {
        if (button) button.disabled = false;
        window.alert(readableError(error));
    }
}

byId("surveyQuestions").addEventListener("input", updateSurveyProgress);
byId("surveyQuestions").addEventListener("change", updateSurveyProgress);
byId("cancelSurveyBtn").addEventListener("click", () => {
    currentSurvey = null;
    currentQuestions = [];
    byId("surveyRunner").hidden = true;
    byId("surveyForm").reset();
});

byId("surveyForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = byId("submitSurveyBtn");
    button.disabled = true;
    try {
        const answers = collectAnswers();
        const result = await submitSurvey(currentSurvey.surveyId, answers);
        setMessage(byId("surveyMessage"), result.message);
        currentSurvey = null;
        await loadSurveyData();
        byId("surveyRunner").hidden = true;
    } catch (error) {
        setMessage(byId("surveyMessage"), readableError(error), true);
    } finally {
        button.disabled = false;
    }
});

async function loadSurveyData() {
    try {
        renderSurveyDashboard(await getSurveyDashboard());
    } catch (error) {
        byId("surveyList").textContent = `Unable to load surveys: ${readableError(error)}`;
        byId("surveyHistory").textContent = "Survey history could not be loaded.";
    }
}

function renderQuestionEditor(question = {}) {
    const fieldset = makeElement("fieldset", "question-editor");
    const legend = makeElement("legend", "", `Question ${question.order || 1}`);
    const promptLabel = makeElement("label", "", "Question text");
    const prompt = document.createElement("input");
    prompt.className = "admin-question-prompt";
    prompt.maxLength = 500;
    prompt.required = true;
    prompt.value = question.prompt || "";
    promptLabel.append(prompt);

    const typeLabel = makeElement("label", "", "Answer type");
    const type = document.createElement("select");
    type.className = "admin-question-type";
    for (const [value, labelText] of [
        ["single", "Single selection"],
        ["multiple", "Multiple selection"],
        ["rating", "Rating scale (1–5)"],
        ["text", "Short text"]
    ]) {
        const option = makeElement("option", "", labelText);
        option.value = value;
        type.append(option);
    }
    type.value = question.type || "single";
    typeLabel.append(type);

    const choicesLabel = makeElement("label", "question-choices-label", "Choices (one per line)");
    const choices = document.createElement("textarea");
    choices.className = "admin-question-choices";
    choices.value = (question.choices || []).join("\n");
    choicesLabel.append(choices);

    const requiredLabel = makeElement("label", "admin-check", "");
    const required = document.createElement("input");
    required.type = "checkbox";
    required.className = "admin-question-required";
    required.checked = question.required !== false;
    requiredLabel.append(required, document.createTextNode("Required"));
    fieldset.append(legend, promptLabel, typeLabel, choicesLabel, requiredLabel);

    const updateType = () => {
        choicesLabel.hidden = !["single", "multiple"].includes(type.value);
    };
    type.addEventListener("change", updateType);
    updateType();
    return fieldset;
}

function resetSurveyEditor() {
    byId("surveyEditorForm").reset();
    byId("adminSurveyId").value = "";
    byId("adminSurveyAccess").value = "paid";
    byId("adminReward").value = "20";
    byId("adminSurveyActive").checked = true;
    byId("adminAllowRetakes").checked = false;
    byId("surveyEditorHeading").textContent = "Create Survey";
    byId("saveSurveyBtn").textContent = "Save Survey";
    byId("cancelEditBtn").hidden = true;
    byId("adminQuestionFields").replaceChildren(
        ...Array.from({ length: 10 }, (_, index) => renderQuestionEditor({ order: index + 1 }))
    );
}

async function editSurvey(surveyId) {
    setMessage(byId("adminMessage"), "Loading survey...");
    try {
        const { survey, questions } = await adminGetSurvey(surveyId);
        byId("adminSurveyId").value = survey.surveyId;
        byId("adminSurveyTitle").value = survey.title;
        byId("adminSurveyDescription").value = survey.description || "";
        byId("adminSurveyAccess").value = survey.access;
        byId("adminReward").value = (survey.rewardCents / 100).toFixed(2);
        byId("adminSurveyActive").checked = survey.active;
        byId("adminAllowRetakes").checked = survey.allowRetakes;
        byId("surveyEditorHeading").textContent = "Edit Survey";
        byId("saveSurveyBtn").textContent = "Save Changes";
        byId("cancelEditBtn").hidden = false;
        byId("adminQuestionFields").replaceChildren(...questions.map(renderQuestionEditor));
        byId("surveyEditorHeading").scrollIntoView({ behavior: "smooth" });
        setMessage(byId("adminMessage"), "");
    } catch (error) {
        setMessage(byId("adminMessage"), readableError(error), true);
    }
}

function collectAdminSurvey() {
    const questions = [...byId("adminQuestionFields").querySelectorAll(".question-editor")]
        .map((fieldset, index) => {
            const type = fieldset.querySelector(".admin-question-type").value;
            const question = {
                order: index + 1,
                prompt: fieldset.querySelector(".admin-question-prompt").value.trim(),
                type,
                required: fieldset.querySelector(".admin-question-required").checked
            };
            if (type === "single" || type === "multiple") {
                question.choices = fieldset.querySelector(".admin-question-choices")
                    .value.split("\n").map((choice) => choice.trim()).filter(Boolean);
            } else if (type === "rating") {
                question.min = 1;
                question.max = 5;
            } else {
                question.maxLength = 500;
            }
            return question;
        });

    const survey = {
        surveyId: byId("adminSurveyId").value || undefined,
        title: byId("adminSurveyTitle").value.trim(),
        description: byId("adminSurveyDescription").value.trim(),
        access: byId("adminSurveyAccess").value,
        active: byId("adminSurveyActive").checked,
        allowRetakes: byId("adminAllowRetakes").checked,
        rewardCents: Math.round(Number(byId("adminReward").value) * 100),
        questions
    };
    return survey;
}

function renderAdminSurveyList(surveys) {
    const list = byId("adminSurveyList");
    list.replaceChildren();
    if (!surveys.length) {
        list.append(makeElement("p", "survey-notice", "No surveys have been created."));
        return;
    }
    for (const survey of surveys) {
        const item = makeElement("article", "admin-item");
        item.append(
            makeElement("h4", "", survey.title),
            makeElement("span", `badge ${survey.active ? "approved" : "locked"}`,
                survey.active ? `${survey.access} · active` : "inactive"),
            makeElement("p", "", `${survey.questionCount} questions · ${money(survey.rewardCents)} proposed reward`)
        );
        const edit = makeElement("button", "", "Edit");
        edit.addEventListener("click", () => editSurvey(survey.surveyId));
        item.append(edit);
        if (survey.active) {
            const deactivate = makeElement("button", "danger-button", "Deactivate");
            deactivate.addEventListener("click", async () => {
                if (!window.confirm(`Deactivate "${survey.title}"?`)) return;
                deactivate.disabled = true;
                try {
                    await adminDeactivateSurvey(survey.surveyId);
                    await loadAdminData();
                    await loadSurveyData();
                    setMessage(byId("adminMessage"), "Survey deactivated.");
                } catch (error) {
                    deactivate.disabled = false;
                    setMessage(byId("adminMessage"), readableError(error), true);
                }
            });
            item.append(deactivate);
        }
        list.append(item);
    }
}

function renderAdminSubmissions(submissions) {
    const list = byId("adminSubmissions");
    list.replaceChildren();
    if (!submissions.length) {
        list.append(makeElement("p", "survey-notice", "No submissions are awaiting review."));
        return;
    }
    for (const submission of submissions) {
        const item = makeElement("article", "admin-item");
        item.append(
            makeElement("h4", "", `${submission.surveyTitle} · ${submission.userId}`),
            makeElement("p", "", `Attempt ${submission.attempt} · Proposed reward: ${money(submission.rewardCents)}`)
        );
        const answers = makeElement("div", "");
        for (const question of submission.questionSnapshot) {
            const answer = submission.answers[String(question.order)];
            answers.append(makeElement("p", "admin-answer",
                `${question.order}. ${question.prompt}: ${Array.isArray(answer) ? answer.join(", ") : answer ?? "No response"}`));
        }
        item.append(answers);
        const note = document.createElement("textarea");
        note.maxLength = 1000;
        note.placeholder = "Optional review note";
        item.append(note);
        for (const decision of ["approved", "rejected"]) {
            const button = makeElement("button", decision === "rejected" ? "danger-button" : "",
                decision === "approved" ? "Approve" : "Reject");
            button.addEventListener("click", async () => {
                if (decision === "approved"
                    && !window.confirm("Approve this response? This records an approved earning and creates a platform liability; payouts remain disabled.")) return;
                button.disabled = true;
                try {
                    await adminReviewSubmission(submission.submissionId, decision, note.value);
                    await loadAdminData();
                    await loadSurveyData();
                    setMessage(byId("adminMessage"), `Submission ${decision}.`);
                } catch (error) {
                    button.disabled = false;
                    setMessage(byId("adminMessage"), readableError(error), true);
                }
            });
            item.append(button);
        }
        list.append(item);
    }
}

function renderAdminUsers(users) {
    const list = byId("adminUsers");
    list.replaceChildren();
    if (!users.length) {
        list.append(makeElement("p", "survey-notice", "No user profiles are available."));
        return;
    }
    for (const user of users) {
        list.append(makeElement("p", "admin-answer",
            `${user.fullName || "Unnamed"} · ${user.email} · ${user.phone} · ${user.accountStatus}`));
    }
}

function renderAdminPayments(payments) {
    const list = byId("adminPayments");
    list.replaceChildren();
    if (!payments.length) {
        list.append(makeElement("p", "survey-notice", "No verified payment transactions are recorded."));
        return;
    }
    for (const payment of payments) {
        list.append(makeElement("p", "admin-answer",
            `${payment.transactionId} · ${payment.status || "unknown"} · ${money(payment.amountCents)}`));
    }
}

async function loadAdminData() {
    try {
        const [surveyResult, dashboard] = await Promise.all([adminListSurveys(), adminDashboard()]);
        renderAdminSurveyList(surveyResult.surveys);
        renderAdminSubmissions(dashboard.pendingSubmissions);
        renderAdminUsers(dashboard.users);
        renderAdminPayments(dashboard.paymentTransactions);
        byId("adminLiability").textContent = `Approved reward ledger liability: ${money(dashboard.totalRewardLiabilityCents)}.`;
        byId("adminPaymentStatus").textContent = dashboard.paymentProviderConfigured
            ? "Payment provider is configured."
            : "No payment provider is configured. Paid access remains locked and transaction processing is disabled.";
    } catch (error) {
        setMessage(byId("adminMessage"), `Unable to load administrator data: ${readableError(error)}`, true);
    }
}

byId("seedSurveysBtn").addEventListener("click", async () => {
    const button = byId("seedSurveysBtn");
    button.disabled = true;
    try {
        const result = await seedDefaultSurveys();
        setMessage(byId("adminMessage"), result.created
            ? `${result.created} free survey(s) created. Existing surveys were preserved.`
            : "The three free surveys already exist; no existing surveys were changed.");
        await loadAdminData();
        await loadSurveyData();
    } catch (error) {
        setMessage(byId("adminMessage"), readableError(error), true);
    } finally {
        button.disabled = false;
    }
});

byId("surveyEditorForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = byId("saveSurveyBtn");
    button.disabled = true;
    try {
        await adminSaveSurvey(collectAdminSurvey());
        setMessage(byId("adminMessage"), "Survey saved with 10 validated questions.");
        resetSurveyEditor();
        await loadAdminData();
        await loadSurveyData();
    } catch (error) {
        setMessage(byId("adminMessage"), readableError(error), true);
    } finally {
        button.disabled = false;
    }
});

byId("cancelEditBtn").addEventListener("click", resetSurveyEditor);

byId("logoutBtn").addEventListener("click", async () => {
    const button = byId("logoutBtn");
    button.disabled = true;
    try {
        await logoutUser();
        window.location.replace("login.html");
    } catch (error) {
        console.error(error);
        window.alert(`Unable to log out: ${readableError(error)}`);
        button.disabled = false;
    }
});

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace("login.html");
        return;
    }
    try {
        await user.reload();
        if (!await loadAccount(user)) return;
        await loadSurveyData();
        const token = await user.getIdTokenResult(true);
        isAdmin = token.claims.admin === true;
        if (isAdmin) {
            byId("adminDashboard").hidden = false;
            resetSurveyEditor();
            await loadAdminData();
        }
    } catch (error) {
        console.error(error);
        window.alert(`Unable to load your dashboard: ${readableError(error)}`);
    }
});
