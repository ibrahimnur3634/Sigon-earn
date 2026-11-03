import { httpsCallable } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-functions.js";
import { functions } from "./firebase.js";

async function callFunction(name, data = {}) {
    const result = await httpsCallable(functions, name)(data);
    return result.data;
}

export const getSurveyDashboard = () => callFunction("getSurveyDashboard");
export const getSurveyQuestions = (surveyId) => callFunction("getSurveyQuestions", { surveyId });
export const submitSurvey = (surveyId, answers) => callFunction("submitSurvey", { surveyId, answers });
export const seedDefaultSurveys = () => callFunction("seedDefaultSurveys");
export const adminGetSurvey = (surveyId) => callFunction("adminGetSurvey", { surveyId });
export const adminListSurveys = () => callFunction("adminListSurveys");
export const adminSaveSurvey = (survey) => callFunction("adminSaveSurvey", survey);
export const adminDeactivateSurvey = (surveyId) => callFunction("adminDeactivateSurvey", { surveyId });
export const adminReviewSubmission = (submissionId, decision, reviewNote) =>
    callFunction("adminReviewSubmission", { submissionId, decision, reviewNote });
export const adminDashboard = () => callFunction("adminDashboard");
