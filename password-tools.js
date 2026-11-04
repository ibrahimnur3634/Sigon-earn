export function attachPasswordToggles(container) {
    container.querySelectorAll("[data-password-toggle]").forEach((toggle) => {
        const input = container.querySelector(`#${toggle.dataset.passwordToggle}`);
        if (!input) {
            return;
        }

        toggle.addEventListener("click", () => {
            const isVisible = input.type === "text";
            input.type = isVisible ? "password" : "text";
            toggle.setAttribute("aria-pressed", String(!isVisible));
            toggle.setAttribute("aria-label", isVisible ? "Show password" : "Hide password");
        });
    });
}

export function isStrongPassword(password) {
    return password.length >= 8
        && /[A-Z]/.test(password)
        && /[a-z]/.test(password)
        && /\d/.test(password)
        && /[^A-Za-z0-9]/.test(password);
}

export function updatePasswordRequirements(input, requirements) {
    const password = input.value;
    const satisfiedRules = {
        length: password.length >= 8,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        number: /\d/.test(password),
        special: /[^A-Za-z0-9]/.test(password)
    };

    requirements.querySelectorAll("[data-password-rule]").forEach((rule) => {
        const isMet = satisfiedRules[rule.dataset.passwordRule];
        rule.classList.toggle("is-met", isMet);
        rule.setAttribute("aria-label", `${rule.textContent.trim()}${isMet ? ", met" : ", not met"}`);
    });
}
