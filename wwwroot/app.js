const STORAGE_KEY = "grassquest-local-session-v1";

const state = {
    durationMinutes: 20,
    environment: "neighborhood",
    goal: "notice-nature",
    activityLevel: "easy",
    companion: "solo",
    checkedTasks: new Set(),
    checkedBingo: new Set(),
    lastQuest: null,
    generating: false,
    aiAvailable: false,
    timerRemainingSeconds: 20 * 60,
    timerRunning: false,
    timerEndsAt: null,
    timerInterval: null,
    installPrompt: null
};

const elements = {
    form: document.getElementById("questForm"),
    environment: document.getElementById("environment"),
    generateButton: document.getElementById("generateButton"),
    errorMessage: document.getElementById("errorMessage"),

    localStatus: document.getElementById("localStatus"),
    localStatusLabel: document.getElementById("localStatusLabel"),
    localStatusMessage: document.getElementById("localStatusMessage"),
    installButton: document.getElementById("installButton"),

    resultSection: document.getElementById("resultSection"),
    offlineNotice: document.getElementById("offlineNotice"),
    resultDuration: document.getElementById("resultDuration"),
    questTitle: document.getElementById("questTitle"),
    questIntro: document.getElementById("questIntro"),
    tasksList: document.getElementById("tasksList"),
    taskProgress: document.getElementById("taskProgress"),
    taskProgressBar: document.getElementById("taskProgressBar"),
    completionBanner: document.getElementById("completionBanner"),

    bingoGrid: document.getElementById("bingoGrid"),
    bingoProgress: document.getElementById("bingoProgress"),
    bingoProgressBar: document.getElementById("bingoProgressBar"),
    returnQuestion: document.getElementById("returnQuestion"),

    timerDisplay: document.getElementById("timerDisplay"),
    timerStatus: document.getElementById("timerStatus"),
    timerStartPauseButton: document.getElementById("timerStartPauseButton"),
    timerResetButton: document.getElementById("timerResetButton"),
    pocketModeButton: document.getElementById("pocketModeButton"),
    exitPocketModeButton: document.getElementById("exitPocketModeButton"),

    shareButton: document.getElementById("shareButton"),
    downloadButton: document.getElementById("downloadButton"),
    printButton: document.getElementById("printButton"),
    newQuestButton: document.getElementById("newQuestButton"),
    actionMessage: document.getElementById("actionMessage")
};

// --------------------------------------------------
// CHOICE BUTTONS
// --------------------------------------------------

function bindChoiceButtons(selector, dataKey, onSelect) {
    const buttons = document.querySelectorAll(selector);

    buttons.forEach(button => {
        button.addEventListener("click", () => {
            const value = button.dataset[dataKey];
            onSelect(value);

            buttons.forEach(otherButton => {
                const selected = otherButton === button;
                otherButton.classList.toggle("selected", selected);
                otherButton.setAttribute("aria-pressed", String(selected));
            });
        });
    });
}

bindChoiceButtons("[data-duration]", "duration", value => {
    state.durationMinutes = Number(value);
});

bindChoiceButtons("[data-goal]", "goal", value => {
    state.goal = value;
});

bindChoiceButtons("[data-level]", "level", value => {
    state.activityLevel = value;
});

bindChoiceButtons("[data-companion]", "companion", value => {
    state.companion = value;
});

elements.environment.addEventListener("change", event => {
    state.environment = event.target.value;
});

function applyPreferences(preferences) {
    state.durationMinutes = Number(preferences.durationMinutes) || 20;
    state.environment = preferences.environment || "neighborhood";
    state.goal = preferences.goal || "notice-nature";
    state.activityLevel = preferences.activityLevel || "easy";
    state.companion = preferences.companion || "solo";
    elements.environment.value = state.environment;

    const groups = [
        ["[data-duration]", "duration", String(state.durationMinutes)],
        ["[data-goal]", "goal", state.goal],
        ["[data-level]", "level", state.activityLevel],
        ["[data-companion]", "companion", state.companion]
    ];

    groups.forEach(([selector, dataKey, selectedValue]) => {
        document.querySelectorAll(selector).forEach(button => {
            const selected = button.dataset[dataKey] === selectedValue;
            button.classList.toggle("selected", selected);
            button.setAttribute("aria-pressed", String(selected));
        });
    });
}

// --------------------------------------------------
// LOCAL AI STATUS
// --------------------------------------------------

async function refreshLocalStatus() {
    elements.localStatus.className = "status-pill status-checking";
    elements.localStatusLabel.textContent = "CHECKING LOCAL AI";
    elements.localStatusMessage.textContent = "Checking Ollama on this computer...";

    try {
        const response = await fetch("/api/status", { cache: "no-store" });
        if (!response.ok) throw new Error("Status check failed.");

        const data = await response.json();
        state.aiAvailable = Boolean(data.available && data.modelInstalled);

        if (state.aiAvailable) {
            elements.localStatus.className = "status-pill status-ready";
            elements.localStatusLabel.textContent = "100% LOCAL AI";
            elements.localStatusMessage.textContent = data.message;
        } else if (data.available && !data.modelInstalled) {
            elements.localStatus.className = "status-pill status-warning";
            elements.localStatusLabel.textContent = "MODEL NOT READY";
            elements.localStatusMessage.textContent = data.message;
        } else {
            elements.localStatus.className = "status-pill status-offline";
            elements.localStatusLabel.textContent = "LOCAL AI UNAVAILABLE";
            elements.localStatusMessage.textContent = data.message || "Ollama is not available.";
        }
    } catch {
        state.aiAvailable = false;
        elements.localStatus.className = "status-pill status-offline";
        elements.localStatusLabel.textContent = "LOCAL AI UNAVAILABLE";
        elements.localStatusMessage.textContent = "Start GrassQuest and Ollama to generate a new quest.";
    }

    updateOfflineNotice();
}

function updateOfflineNotice() {
    elements.offlineNotice.hidden = !(state.lastQuest && !state.aiAvailable);
}

// --------------------------------------------------
// ERRORS AND MESSAGES
// --------------------------------------------------

function showError(message) {
    elements.errorMessage.textContent = message;
    elements.errorMessage.hidden = false;
}

function clearError() {
    elements.errorMessage.textContent = "";
    elements.errorMessage.hidden = true;
}

function showActionMessage(message) {
    elements.actionMessage.textContent = message;
}

// --------------------------------------------------
// GENERATE QUEST
// --------------------------------------------------

elements.form.addEventListener("submit", async event => {
    event.preventDefault();
    await generateQuest();
});

async function generateQuest() {
    if (state.generating) return;

    clearError();
    showActionMessage("");
    state.generating = true;
    elements.generateButton.disabled = true;

    const buttonLabel = elements.generateButton.querySelector("span:first-child");
    const originalLabel = buttonLabel.textContent;
    buttonLabel.textContent = "Asking Gemma locally...";

    try {
        const response = await fetch("/api/quest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                durationMinutes: state.durationMinutes,
                environment: state.environment,
                goal: state.goal,
                activityLevel: state.activityLevel,
                companion: state.companion
            })
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
            throw new Error(
                data?.detail || data?.message || data?.title ||
                "Quest generation failed. Please try again."
            );
        }

        if (!isValidQuest(data)) {
            throw new Error("Gemma returned an unexpected response. Please try again.");
        }

        const preferences = {
            durationMinutes: state.durationMinutes,
            environment: state.environment,
            goal: state.goal,
            activityLevel: state.activityLevel,
            companion: state.companion
        };

        state.lastQuest = { quest: data, preferences };
        state.checkedTasks = new Set();
        state.checkedBingo = new Set();
        resetTimerForQuest();
        renderQuest(data, preferences);
        elements.resultSection.hidden = false;
        updateOfflineNotice();
        saveSession();

        elements.resultSection.scrollIntoView({
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
            block: "start"
        });
    } catch (error) {
        const message = error instanceof TypeError
            ? "Couldn't reach GrassQuest's local API. Check that the backend is running. Your saved quest, if you have one, remains available."
            : error.message;
        showError(message);
    } finally {
        state.generating = false;
        elements.generateButton.disabled = false;
        buttonLabel.textContent = originalLabel;
    }
}

function isValidQuest(quest) {
    return Boolean(
        quest &&
        typeof quest.title === "string" && quest.title.trim() &&
        Array.isArray(quest.tasks) && quest.tasks.length === 5 &&
        quest.tasks.every(item => typeof item === "string" && item.trim()) &&
        Array.isArray(quest.bingo) && quest.bingo.length === 9 &&
        quest.bingo.every(item => typeof item === "string" && item.trim())
    );
}

// --------------------------------------------------
// RENDER QUEST AND PROGRESS
// --------------------------------------------------

function renderQuest(quest, preferences = state.lastQuest?.preferences) {
    elements.questTitle.textContent = quest.title;
    elements.questIntro.textContent = quest.intro || "A small outdoor adventure, made just for this moment.";
    elements.resultDuration.textContent = `${preferences?.durationMinutes || state.durationMinutes} MINUTES`;
    elements.returnQuestion.textContent = quest.returnQuestion || "What was the most interesting thing you noticed?";

    renderTasks(quest.tasks);
    renderBingo(quest.bingo);
    updateTimerDisplay();
}

function renderTasks(tasks) {
    elements.tasksList.replaceChildren();

    tasks.forEach((task, index) => {
        const item = document.createElement("li");
        const toggle = document.createElement("button");
        const number = document.createElement("span");
        const text = document.createElement("span");
        const check = document.createElement("span");
        const checked = state.checkedTasks.has(index);

        toggle.type = "button";
        toggle.className = "task-toggle";
        toggle.setAttribute("aria-pressed", String(checked));
        toggle.setAttribute("aria-label", `${checked ? "Mark incomplete" : "Complete"}: ${task}`);

        number.className = "task-number";
        number.textContent = String(index + 1).padStart(2, "0");
        text.className = "task-text";
        text.textContent = task;
        check.className = "task-check";
        check.textContent = "✓";
        check.setAttribute("aria-hidden", "true");

        toggle.append(number, text, check);
        if (checked) toggle.classList.add("is-complete");

        toggle.addEventListener("click", () => {
            if (state.checkedTasks.has(index)) state.checkedTasks.delete(index);
            else state.checkedTasks.add(index);

            const isComplete = state.checkedTasks.has(index);
            toggle.classList.toggle("is-complete", isComplete);
            toggle.setAttribute("aria-pressed", String(isComplete));
            toggle.setAttribute("aria-label", `${isComplete ? "Mark incomplete" : "Complete"}: ${task}`);
            updateTaskProgress(tasks.length);
            saveSession();
        });

        item.appendChild(toggle);
        elements.tasksList.appendChild(item);
    });

    updateTaskProgress(tasks.length);
}

function updateTaskProgress(total) {
    const completed = state.checkedTasks.size;
    elements.taskProgress.textContent = `${completed} of ${total} complete`;
    elements.taskProgressBar.style.width = `${total ? (completed / total) * 100 : 0}%`;
    elements.taskProgressBar.parentElement.setAttribute("aria-label", `${completed} of ${total} missions complete`);
    elements.taskProgressBar.parentElement.setAttribute("role", "progressbar");
    elements.taskProgressBar.parentElement.setAttribute("aria-valuemin", "0");
    elements.taskProgressBar.parentElement.setAttribute("aria-valuemax", String(total));
    elements.taskProgressBar.parentElement.setAttribute("aria-valuenow", String(completed));
    elements.completionBanner.hidden = completed < total;
}

// --------------------------------------------------
// OUTSIDE BINGO
// --------------------------------------------------

function renderBingo(items) {
    elements.bingoGrid.replaceChildren();

    items.forEach((item, index) => {
        const tile = document.createElement("button");
        const checked = state.checkedBingo.has(index);

        tile.type = "button";
        tile.className = "bingo-tile";
        tile.textContent = item;
        tile.setAttribute("aria-pressed", String(checked));
        tile.setAttribute("aria-label", `${checked ? "Unmark" : "Mark"} ${item} as discovered`);

        tile.addEventListener("click", () => {
            if (state.checkedBingo.has(index)) state.checkedBingo.delete(index);
            else state.checkedBingo.add(index);

            const isChecked = state.checkedBingo.has(index);
            tile.setAttribute("aria-pressed", String(isChecked));
            tile.setAttribute("aria-label", `${isChecked ? "Unmark" : "Mark"} ${item} as discovered`);
            updateBingoProgress(items.length);
            saveSession();
        });

        elements.bingoGrid.appendChild(tile);
    });

    updateBingoProgress(items.length);
}

function updateBingoProgress(total) {
    const found = state.checkedBingo.size;
    elements.bingoProgress.textContent = found === total
        ? `Bingo complete! ${found} of ${total}`
        : `${found} of ${total} discovered`;
    elements.bingoProgressBar.style.width = `${total ? (found / total) * 100 : 0}%`;
}

// --------------------------------------------------
// MISSION TIMER AND POCKET MODE
// --------------------------------------------------

function resetTimerForQuest() {
    stopTimerInterval();
    state.timerRemainingSeconds = state.lastQuest.preferences.durationMinutes * 60;
    state.timerRunning = false;
    state.timerEndsAt = null;
    updateTimerDisplay();
}

function updateTimerDisplay() {
    const seconds = Math.max(0, Math.floor(state.timerRemainingSeconds));
    const minutesPart = Math.floor(seconds / 60).toString().padStart(2, "0");
    const secondsPart = (seconds % 60).toString().padStart(2, "0");
    elements.timerDisplay.textContent = `${minutesPart}:${secondsPart}`;
    elements.timerStartPauseButton.textContent = state.timerRunning ? "Pause timer" : "Start timer";
    elements.timerStartPauseButton.setAttribute("aria-pressed", String(state.timerRunning));

    const totalSeconds = (state.lastQuest?.preferences?.durationMinutes || state.durationMinutes) * 60;
    if (seconds <= 0) {
        elements.timerStatus.textContent = "Time's up — finish your loop safely.";
        elements.timerDisplay.classList.add("timer-finished");
    } else {
        elements.timerDisplay.classList.remove("timer-finished");
        elements.timerStatus.textContent = state.timerRunning
            ? "Time is running. Keep your phone tucked away."
            : seconds < totalSeconds
                ? "Paused. Resume whenever you're ready."
                : "Ready when you are.";
    }
}

function startTimerInterval() {
    stopTimerInterval();
    state.timerInterval = window.setInterval(tickTimer, 1000);
}

function stopTimerInterval() {
    if (state.timerInterval !== null) {
        window.clearInterval(state.timerInterval);
        state.timerInterval = null;
    }
}

function tickTimer() {
    if (!state.timerRunning || !state.timerEndsAt) return;

    state.timerRemainingSeconds = Math.max(0, Math.ceil((state.timerEndsAt - Date.now()) / 1000));
    if (state.timerRemainingSeconds <= 0) {
        state.timerRunning = false;
        state.timerEndsAt = null;
        stopTimerInterval();
    }

    updateTimerDisplay();
    saveSession();
}

elements.timerStartPauseButton.addEventListener("click", () => {
    if (!state.lastQuest) return;

    if (state.timerRunning) {
        state.timerRemainingSeconds = Math.max(0, Math.ceil((state.timerEndsAt - Date.now()) / 1000));
        state.timerRunning = false;
        state.timerEndsAt = null;
        stopTimerInterval();
    } else {
        if (state.timerRemainingSeconds <= 0) {
            state.timerRemainingSeconds = state.lastQuest.preferences.durationMinutes * 60;
        }
        state.timerRunning = true;
        state.timerEndsAt = Date.now() + state.timerRemainingSeconds * 1000;
        startTimerInterval();
    }

    updateTimerDisplay();
    saveSession();
});

elements.timerResetButton.addEventListener("click", () => {
    if (!state.lastQuest) return;
    resetTimerForQuest();
    saveSession();
});

function setPocketMode(enabled) {
    document.body.classList.toggle("pocket-mode", enabled);
    elements.pocketModeButton.hidden = enabled;
    elements.exitPocketModeButton.hidden = !enabled;
    elements.exitPocketModeButton.setAttribute("aria-pressed", String(enabled));
    if (enabled) {
        window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
}

elements.pocketModeButton.addEventListener("click", () => setPocketMode(true));
elements.exitPocketModeButton.addEventListener("click", () => setPocketMode(false));

// --------------------------------------------------
// SAVE / RESTORE SESSION
// --------------------------------------------------

function saveSession() {
    if (!state.lastQuest) return;

    try {
        const remaining = state.timerRunning && state.timerEndsAt
            ? Math.max(0, Math.ceil((state.timerEndsAt - Date.now()) / 1000))
            : state.timerRemainingSeconds;

        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            lastQuest: state.lastQuest,
            checkedTasks: [...state.checkedTasks],
            checkedBingo: [...state.checkedBingo],
            timerRemainingSeconds: remaining,
            timerRunning: state.timerRunning,
            timerEndsAt: state.timerEndsAt
        }));
    } catch {
        // The app remains usable even if browser storage is disabled or full.
    }
}

function restoreSession() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;

        const saved = JSON.parse(raw);
        const quest = saved?.lastQuest?.quest;
        const preferences = saved?.lastQuest?.preferences;
        if (!isValidQuest(quest) || !preferences) return;

        state.lastQuest = { quest, preferences };
        applyPreferences(preferences);
        state.checkedTasks = new Set((saved.checkedTasks || []).filter(index => Number.isInteger(index) && index >= 0 && index < 5));
        state.checkedBingo = new Set((saved.checkedBingo || []).filter(index => Number.isInteger(index) && index >= 0 && index < 9));
        state.timerRemainingSeconds = Number.isFinite(saved.timerRemainingSeconds)
            ? Math.max(0, Math.min(Number(saved.timerRemainingSeconds), Number(preferences.durationMinutes) * 60))
            : Number(preferences.durationMinutes) * 60;
        state.timerRunning = Boolean(saved.timerRunning && saved.timerEndsAt);
        state.timerEndsAt = state.timerRunning ? Number(saved.timerEndsAt) : null;

        if (state.timerRunning) {
            state.timerRemainingSeconds = Math.max(0, Math.ceil((state.timerEndsAt - Date.now()) / 1000));
            if (state.timerRemainingSeconds <= 0) {
                state.timerRunning = false;
                state.timerEndsAt = null;
            }
        }

        renderQuest(quest, preferences);
        elements.resultSection.hidden = false;
        if (state.timerRunning) startTimerInterval();
        updateOfflineNotice();
        saveSession();
    } catch {
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore unavailable storage */ }
    }
}

// --------------------------------------------------
// DOWNLOAD, SHARE, PRINT, NEW QUEST
// --------------------------------------------------

function buildQuestText() {
    if (!state.lastQuest) return "";
    const { quest, preferences } = state.lastQuest;
    return [
        "GRASSQUEST LOCAL",
        quest.title,
        `${preferences.durationMinutes} minutes · ${preferences.environment}`,
        "",
        quest.intro || "",
        "",
        "YOUR FIVE MISSIONS",
        ...quest.tasks.map((task, index) => `${state.checkedTasks.has(index) ? "[x]" : "[ ]"} ${index + 1}. ${task}`),
        "",
        "OUTSIDE BINGO",
        ...quest.bingo.map((item, index) => `${state.checkedBingo.has(index) ? "[x]" : "[ ]"} ${item}`),
        "",
        "WHEN YOU GET BACK",
        quest.returnQuestion || "What was the most interesting thing you noticed?",
        "",
        "Made with GrassQuest Local · Local AI, no cloud AI required"
    ].join("\n");
}

function downloadQuest() {
    if (!state.lastQuest) return;
    const blob = new Blob([buildQuestText()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "grassquest-outdoor-mission.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

elements.downloadButton.addEventListener("click", downloadQuest);

elements.shareButton.addEventListener("click", async () => {
    if (!state.lastQuest) return;
    const text = buildQuestText();

    try {
        if (navigator.share) {
            await navigator.share({ title: `GrassQuest: ${state.lastQuest.quest.title}`, text });
            showActionMessage("Quest shared.");
            return;
        }
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            showActionMessage("Quest copied to your clipboard.");
            return;
        }
        downloadQuest();
        showActionMessage("Sharing isn't available here, so your quest was downloaded instead.");
    } catch (error) {
        if (error?.name !== "AbortError") {
            downloadQuest();
            showActionMessage("Couldn't open sharing, so your quest was downloaded instead.");
        }
    }
});

elements.printButton.addEventListener("click", () => {
    if (state.lastQuest) window.print();
});

elements.newQuestButton.addEventListener("click", () => {
    stopTimerInterval();
    state.timerRunning = false;
    state.timerEndsAt = null;
    state.lastQuest = null;
    state.checkedTasks = new Set();
    state.checkedBingo = new Set();
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setPocketMode(false);
    elements.resultSection.hidden = true;
    elements.offlineNotice.hidden = true;
    showActionMessage("");
    clearError();
    elements.form.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start"
    });
});

// --------------------------------------------------
// INSTALLABLE PWA / OFFLINE APP SHELL
// --------------------------------------------------

window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    state.installPrompt = event;
    elements.installButton.hidden = false;
});

elements.installButton.addEventListener("click", async () => {
    if (!state.installPrompt) return;
    state.installPrompt.prompt();
    await state.installPrompt.userChoice;
    state.installPrompt = null;
    elements.installButton.hidden = true;
});

window.addEventListener("appinstalled", () => {
    elements.installButton.hidden = true;
    showActionMessage("GrassQuest is installed on this device.");
});

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/service-worker.js").catch(() => {
            // PWA enhancements are optional; the normal website still works.
        });
    });
}

// --------------------------------------------------
// STARTUP
// --------------------------------------------------

restoreSession();
refreshLocalStatus();
