const test = require("node:test");
const assert = require("node:assert/strict");
const {
    defaultSurveys,
    DEFAULT_REWARD_CENTS,
    PAID_SURVEY_ACTIVATION_PRICE_CENTS
} = require("./defaultSurveys");
const {
    validateQuestionSet,
    validateAnswers,
    getNextAttempt,
    getSurveyRewardId
} = require("./validation");

test("the three free default surveys have ten questions and every required type", () => {
    assert.equal(defaultSurveys.length, 3);
    for (const survey of defaultSurveys) {
        const questions = validateQuestionSet(survey.questions);
        assert.equal(questions.length, 10);
        assert.deepEqual(new Set(questions.map((question) => question.type)),
            new Set(["single", "multiple", "rating", "text"]));
    }
});

test("question validation rejects surveys that do not contain exactly ten questions", () => {
    assert.throws(() => validateQuestionSet(defaultSurveys[0].questions.slice(0, 9)),
        /exactly 10/);
});

test("answer validation requires every required question and enforces answer types", () => {
    const questions = validateQuestionSet(defaultSurveys[0].questions);
    assert.throws(() => validateAnswers(questions, {}), /Answer question 1/);

    const answers = {
        1: "Smartphone",
        2: "Several times a day",
        3: ["Communication", "Work"],
        4: 4,
        5: "Mobile data",
        6: "Faster connectivity",
        7: "Every 2–3 years",
        8: ["Price", "Security"],
        9: 5,
        10: "Reliable access"
    };
    assert.equal(Object.keys(validateAnswers(questions, answers)).length, 10);
    assert.throws(() => validateAnswers(questions, { ...answers, 1: "Made up" }), /valid answer/);
    assert.throws(() => validateAnswers(questions, { ...answers, 4: 8 }), /rating between/);
    assert.throws(() => validateAnswers(questions, { ...answers, 11: "Unknown" }), /unknown question/);
});

test("duplicate submissions are blocked unless an administrator enables retakes", () => {
    assert.equal(getNextAttempt({}, false), 1);
    assert.throws(() => getNextAttempt({ attemptCount: 1 }, false), /already submitted/);
    assert.equal(getNextAttempt({ attemptCount: 1 }, true), 2);
    assert.throws(() => getNextAttempt({ pendingSubmissionId: "pending" }, true), /awaiting review/);
});

test("the proposed reward for each seeded survey is twenty US dollars", () => {
    for (const survey of defaultSurveys) {
        assert.equal(DEFAULT_REWARD_CENTS, 20 * 100);
        assert.equal(survey.questions.length, 10);
    }
    assert.equal(PAID_SURVEY_ACTIVATION_PRICE_CENTS, 10 * 100);
});

test("reward ledger identity prevents a second reward for the same user's survey", () => {
    assert.equal(
        getSurveyRewardId("user-1", "technology-internet"),
        getSurveyRewardId("user-1", "technology-internet")
    );
    assert.notEqual(
        getSurveyRewardId("user-1", "technology-internet"),
        getSurveyRewardId("user-2", "technology-internet")
    );
});
