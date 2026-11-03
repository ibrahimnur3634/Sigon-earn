const QUESTION_TYPES = new Set(["single", "multiple", "rating", "text"]);

function validateQuestionSet(questions) {
    if (!Array.isArray(questions) || questions.length !== 10) {
        throw new Error("Every survey must contain exactly 10 questions.");
    }

    const orders = new Set();
    return questions.map((question) => {
        if (!question || typeof question !== "object"
            || !Number.isInteger(question.order) || question.order < 1 || question.order > 10
            || orders.has(question.order)) {
            throw new Error("Question order must contain each number from 1 to 10 exactly once.");
        }
        orders.add(question.order);

        if (typeof question.prompt !== "string"
            || question.prompt.trim().length < 3
            || question.prompt.trim().length > 500) {
            throw new Error(`Question ${question.order} must have a prompt between 3 and 500 characters.`);
        }
        if (!QUESTION_TYPES.has(question.type) || typeof question.required !== "boolean") {
            throw new Error(`Question ${question.order} has an unsupported type or missing required setting.`);
        }

        const normalized = {
            order: question.order,
            prompt: question.prompt.trim(),
            type: question.type,
            required: question.required
        };

        if (question.type === "single" || question.type === "multiple") {
            if (!Array.isArray(question.choices)
                || question.choices.length < 2
                || question.choices.length > 20
                || question.choices.some((choice) => typeof choice !== "string"
                    || choice.trim().length < 1
                    || choice.trim().length > 200)) {
                throw new Error(`Question ${question.order} must have 2 to 20 valid choices.`);
            }
            normalized.choices = question.choices.map((choice) => choice.trim());
            if (new Set(normalized.choices).size !== normalized.choices.length) {
                throw new Error(`Question ${question.order} choices must be unique.`);
            }
        } else if (question.type === "rating") {
            if (!Number.isInteger(question.min) || !Number.isInteger(question.max)
                || question.min < 0 || question.max > 10 || question.min >= question.max) {
                throw new Error(`Question ${question.order} must have a valid rating range.`);
            }
            normalized.min = question.min;
            normalized.max = question.max;
        } else {
            if (!Number.isInteger(question.maxLength) || question.maxLength < 1 || question.maxLength > 2000) {
                throw new Error(`Question ${question.order} must have a valid text length limit.`);
            }
            normalized.maxLength = question.maxLength;
        }

        return normalized;
    }).sort((a, b) => a.order - b.order);
}

function validateAnswers(questions, answers) {
    if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
        throw new Error("Survey answers are required.");
    }

    const validKeys = new Set(questions.map((question) => String(question.order)));
    if (Object.keys(answers).some((key) => !validKeys.has(key))) {
        throw new Error("Answers contain an unknown question.");
    }

    for (const question of questions) {
        const answer = answers[String(question.order)];
        const empty = answer === undefined || answer === null
            || answer === "" || (Array.isArray(answer) && answer.length === 0);

        if (empty && question.required) {
            throw new Error(`Answer question ${question.order} before submitting.`);
        }
        if (empty) continue;

        if (question.type === "single") {
            if (typeof answer !== "string" || !question.choices.includes(answer)) {
                throw new Error(`Choose a valid answer for question ${question.order}.`);
            }
        } else if (question.type === "multiple") {
            if (!Array.isArray(answer) || answer.length === 0
                || answer.some((choice) => !question.choices.includes(choice))
                || new Set(answer).size !== answer.length) {
                throw new Error(`Select valid choices for question ${question.order}.`);
            }
        } else if (question.type === "rating") {
            if (!Number.isInteger(answer) || answer < question.min || answer > question.max) {
                throw new Error(`Choose a rating between ${question.min} and ${question.max} for question ${question.order}.`);
            }
        } else if (typeof answer !== "string"
            || answer.trim().length === 0
            || answer.trim().length > question.maxLength) {
            throw new Error(`Enter a valid response for question ${question.order}.`);
        }
    }

    return Object.fromEntries(questions.map((question) => [
        String(question.order),
        question.type === "text" && typeof answers[String(question.order)] === "string"
            ? answers[String(question.order)].trim()
            : answers[String(question.order)]
    ]).filter(([, answer]) => answer !== undefined));
}

function getNextAttempt(progress, allowRetakes) {
    if (progress.pendingSubmissionId) {
        throw new Error("Your submission is awaiting review.");
    }
    const attempt = (progress.attemptCount || 0) + 1;
    if (attempt > 1 && !allowRetakes) {
        throw new Error("You have already submitted this survey.");
    }
    return attempt;
}

function getSurveyRewardId(userId, surveyId) {
    return `survey_${userId}_${surveyId}`;
}

module.exports = { validateQuestionSet, validateAnswers, getNextAttempt, getSurveyRewardId };
