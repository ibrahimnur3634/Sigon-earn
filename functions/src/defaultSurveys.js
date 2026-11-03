const single = (order, prompt, choices) => ({ order, prompt, type: "single", required: true, choices });
const multiple = (order, prompt, choices) => ({ order, prompt, type: "multiple", required: true, choices });
const rating = (order, prompt) => ({ order, prompt, type: "rating", required: true, min: 1, max: 5 });
const text = (order, prompt) => ({ order, prompt, type: "text", required: true, maxLength: 500 });
const DEFAULT_REWARD_CENTS = 2000;
const PAID_SURVEY_ACTIVATION_PRICE_CENTS = 1000;

const defaultSurveys = [
    {
        surveyId: "technology-internet",
        title: "Technology and Internet",
        description: "Tell us about your internet access, devices, and technology habits.",
        questions: [
            single(1, "Which device do you use most often to access the internet?", ["Smartphone", "Laptop", "Desktop computer", "Tablet", "Other"]),
            single(2, "How often do you access the internet?", ["Several times a day", "About once a day", "Several times a week", "Less often"]),
            multiple(3, "Which activities do you use the internet for? Select all that apply.", ["Communication", "Education", "Work", "News", "Entertainment", "Shopping"]),
            rating(4, "How reliable is your internet connection on a typical day?"),
            single(5, "What type of internet connection do you use most?", ["Mobile data", "Home broadband", "Public Wi-Fi", "Work or school network", "Other"]),
            text(6, "What is the main thing you would improve about your internet access?"),
            single(7, "How often do you replace or upgrade your main device?", ["Every year", "Every 2–3 years", "Every 4–5 years", "Only when necessary"]),
            multiple(8, "Which concerns influence your technology choices? Select all that apply.", ["Price", "Privacy", "Security", "Ease of use", "Environmental impact", "Compatibility"]),
            rating(9, "How comfortable are you learning to use a new digital service?"),
            text(10, "What digital tool or service would make your daily life easier?")
        ]
    },
    {
        surveyId: "shopping-consumer",
        title: "Shopping and Consumer Habits",
        description: "Share how you discover products and make everyday shopping decisions.",
        questions: [
            single(1, "Where do you most often buy everyday household items?", ["Local shop", "Supermarket", "Market", "Online store", "A mix of these"]),
            single(2, "How often do you shop online?", ["Weekly or more", "A few times a month", "About once a month", "Rarely", "Never"]),
            multiple(3, "Which factors matter most when choosing a product? Select all that apply.", ["Price", "Quality", "Brand", "Reviews", "Convenience", "Availability"]),
            rating(4, "How satisfied are you with the range of products available where you shop?"),
            text(5, "What was the last product category you researched before buying?"),
            single(6, "How do you usually discover a new product?", ["Friends or family", "Social media", "Online search", "In-store", "Advertising", "Other"]),
            multiple(7, "Which payment methods do you commonly use? Select all that apply.", ["Cash", "Mobile money", "Debit card", "Credit card", "Bank transfer"]),
            rating(8, "How important is locally made or locally sourced merchandise to you?"),
            single(9, "What most often leads you to try a different retailer?", ["Lower prices", "Better selection", "Convenience", "Service", "Recommendation", "Other"]),
            text(10, "What would improve your most recent shopping experience?")
        ]
    },
    {
        surveyId: "education-employment",
        title: "Education and Employment",
        description: "Help us understand learning opportunities and changes in the workplace.",
        questions: [
            single(1, "Which best describes your current main activity?", ["Employed", "Self-employed", "Studying", "Looking for work", "Caregiving", "Other"]),
            single(2, "How do you most often learn a new work-related skill?", ["Formal course", "Online course", "On-the-job training", "Reading", "Mentoring", "Other"]),
            multiple(3, "Which skills would you like to develop? Select all that apply.", ["Digital skills", "Communication", "Management", "Technical skills", "Financial skills", "Other"]),
            rating(4, "How confident are you that you can access useful learning opportunities?"),
            text(5, "What is one skill you would like to learn next?"),
            single(6, "What is your preferred format for learning?", ["In person", "Live online", "Self-paced online", "Printed materials", "A combination"]),
            multiple(7, "Which factors make training difficult to attend? Select all that apply.", ["Cost", "Time", "Internet access", "Location", "Childcare or care duties", "Course availability"]),
            rating(8, "How satisfied are you with your current opportunities to grow professionally?"),
            single(9, "Which work arrangement would you prefer?", ["On-site", "Hybrid", "Remote", "Flexible or shift-based", "No preference"]),
            text(10, "What would make it easier for you to reach your education or employment goals?")
        ]
    }
];

module.exports = {
    defaultSurveys,
    DEFAULT_REWARD_CENTS,
    PAID_SURVEY_ACTIVATION_PRICE_CENTS
};
