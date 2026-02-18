import { createIcons, SendHorizontal } from 'lucide';

// DOM Elements
const welcomeScreen = document.getElementById('welcome-screen');
const mainContent = document.getElementById('main-content');
const phase1 = document.getElementById('onboarding-phase-1');
const phase2 = document.getElementById('onboarding-phase-2');
const phase3 = document.getElementById('onboarding-phase-3');
const startOnboardingBtn = document.getElementById('start-onboarding-btn');
const skipOnboardingBtn = document.getElementById('skip-onboarding-btn');
const userNameInput = document.getElementById('user-name-input');
const submitNameBtn = document.getElementById('submit-name-btn');
const onboardingCompliment = document.getElementById('onboarding-compliment');
const finishOnboardingBtn = document.getElementById('finish-onboarding-btn');
const refreshVerseBtn = document.getElementById('refresh-verse-btn');

const chatInput = document.getElementById('chat-input');
const chatWindow = document.getElementById('chat-window');
const chatMessages = document.getElementById('chat-messages');
const sendBtn = document.getElementById('send-btn');
const creditCountDisplay = document.getElementById('credit-count');
const refillBtn = document.getElementById('refill-btn');
const cooldownTimer = document.getElementById('cooldown-timer');
const prayerTimesDiv = document.getElementById('prayer-times');
const dailyVerseDiv = document.getElementById('daily-verse');
const locationNameSpan = document.getElementById('location-name');
const locationRetryBtn = document.getElementById('location-retry-btn');

// State
let credits = parseInt(localStorage.getItem('askdeen_credits')) || 15;
let onboardingDone = localStorage.getItem('askdeen_onboarding_done') === 'true';
let userData = JSON.parse(localStorage.getItem('askdeen_user_data')) || { name: 'Friend' };
let isCooldown = false;
let conversationHistory = [];
let greetingSent = false;

// Initialize
async function init() {
    updateCreditsUI();
    fetchPrayerTimes();
    fetchDailyVerse();
    
    if (onboardingDone) {
        showDashboard();
    } else {
        setupOnboardingEvents();
    }
}

function updateCreditsUI() {
    creditCountDisplay.textContent = credits;
    localStorage.setItem('askdeen_credits', credits);
}

function showDashboard() {
    welcomeScreen.classList.add('hidden');
    mainContent.classList.remove('hidden');
    
    if (!greetingSent) {
        const greeting = "As-salāmu ʿalaykum! I am your AskDeen assistant.";
        const disclaimer = "I’m an AI assistant, not a scholar. For important matters, please consult a qualified imam.";
        const personal = onboardingDone && userData.name !== 'Friend' 
            ? `Welcome back, ${userData.name}! How can I assist you in your Deen today?`
            : `How can I help you learn more about Islam today?`;
        
        const initialMsg = `${greeting}\n\n${personal}\n\n${disclaimer}`;
        
        if (chatMessages.children.length === 0) {
            appendMessage('bot', initialMsg);
        }
        greetingSent = true;
    }
}

function setupOnboardingEvents() {
    startOnboardingBtn.onclick = () => {
        phase1.classList.add('hidden');
        phase2.classList.remove('hidden');
    };

    skipOnboardingBtn.onclick = () => {
        finishOnboarding();
    };

    const handleNameSubmit = () => {
        const name = userNameInput.value.trim();
        if (name) {
            userData.name = name;
            phase2.classList.add('hidden');
            phase3.classList.remove('hidden');
            onboardingCompliment.textContent = `Mā shā’ Allāh, ${name} is a beautiful name. ✨`;
            // Trigger location permission early if possible
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(() => {}, () => {});
            }
        }
    };

    submitNameBtn.onclick = handleNameSubmit;
    finishOnboardingBtn.onclick = finishOnboarding;
    userNameInput.onkeypress = (e) => {
        if (e.key === 'Enter') handleNameSubmit();
    };
}

function finishOnboarding() {
    onboardingDone = true;
    localStorage.setItem('askdeen_onboarding_done', 'true');
    localStorage.setItem('askdeen_user_data', JSON.stringify(userData));
    showDashboard();
}

function appendMessage(role, content) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}-message`;
    msgDiv.textContent = content;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Remove "minimized" feel when active
    chatWindow.classList.remove('minimized');
    return msgDiv;
}

// AI Chat Logic
async function handleUserMessage() {
    const text = chatInput.value.trim();
    if (!text) return;
    
    if (credits <= 0) {
        appendMessage('bot', "You've run out of credits! Tap the crescent moon above to get 15 more.");
        return;
    }

    chatInput.value = '';
    appendMessage('user', text);
    
    credits -= 1;
    updateCreditsUI();

    const loadingMsg = appendMessage('bot', "...");
    loadingMsg.classList.add('typing-indicator');

    try {
        const systemPrompt = `You are AskDeen, a polite, calm, and respectful Muslim AI assistant. 
        
        🧠 BEHAVIOR RULES:
        - Use Islamic etiquette. Never argue, shame, or sound arrogant.
        - Never claim to be a scholar.
        - If users ask non-Islamic questions, politely steer back to Islamic education.
        - Avoid harsh wording or absolute fatwas (e.g., avoid "100% haram" unless universally agreed upon).
        - Always be gentle and educational.
        - Always end your answers with "Allah knows best."

        📚 KNOWLEDGE SOURCES:
        - Base answers on: The Qur’an, Authentic Hadith (Sahih al-Bukhari & Sahih Muslim), and recognized scholarly institutions like IslamQA (islamqa.info) and SeekersGuidance.org.
        - If scholars differ on a topic, clearly state that there is a difference of opinion.
        - Use phrases like "In Islam...", "According to many scholars...", "The Qur’an teaches that...", "Reported in Sahih al-Bukhari...".

        🚫 RESTRICTIONS:
        - Do not issue fatwas.
        - Do not judge people or give medical/legal advice.
        - No political propaganda or extremist content.

        Mandatory short disclaimer to include if the user asks for a ruling: "I’m an AI, not a scholar. For important matters, consult a qualified imam."

        User name: ${userData.name}`;

        conversationHistory.push({ role: 'user', content: text });
        const historyToSend = conversationHistory.slice(-6);

        const response = await websim.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                ...historyToSend
            ]
        });

        loadingMsg.classList.remove('typing-indicator');
        loadingMsg.textContent = response.content;
        conversationHistory.push({ role: 'assistant', content: response.content });
        
    } catch (error) {
        loadingMsg.textContent = "I'm sorry, I'm having trouble connecting right now. Please try again later.";
    }
}

// Credit Refill Logic
refillBtn.addEventListener('click', () => {
    if (isCooldown) return;
    
    credits = 15;
    updateCreditsUI();
    
    isCooldown = true;
    refillBtn.disabled = true;
    refillBtn.style.opacity = '0.5';
    cooldownTimer.classList.remove('hidden');
    
    let seconds = 15;
    const interval = setInterval(() => {
        seconds--;
        cooldownTimer.textContent = `Wait ${seconds}s...`;
        if (seconds <= 0) {
            clearInterval(interval);
            isCooldown = false;
            refillBtn.disabled = false;
            refillBtn.style.opacity = '1';
            cooldownTimer.classList.add('hidden');
            cooldownTimer.textContent = '15s';
        }
    }, 1000);
});

// APIs
async function fetchPrayerTimes() {
    locationRetryBtn.classList.add('hidden');
    locationNameSpan.textContent = "Detecting location...";
    
    const renderPrayers = (timings) => {
        const prayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
        prayerTimesDiv.innerHTML = prayers.map(name => `
            <div class="prayer-item">
                <div class="prayer-name">${name}</div>
                <div class="prayer-time">${timings[name]}</div>
            </div>
        `).join('');
    };

    const updateLocationName = async (lat, lon) => {
        try {
            const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
            const data = await res.json();
            const name = data.city || data.locality || data.principalSubdivision || "Current Location";
            locationNameSpan.textContent = `${name}${data.countryCode ? ', ' + data.countryCode : ''}`;
        } catch (e) {
            locationNameSpan.textContent = "Your Location";
        }
    };

    const fallback = async () => {
        locationNameSpan.textContent = "Mecca (Default)";
        try {
            const response = await fetch('https://api.aladhan.com/v1/timingsByCity?city=Mecca&country=Saudi%20Arabia&method=4');
            const data = await response.json();
            renderPrayers(data.data.timings);
        } catch (e) {
            prayerTimesDiv.innerHTML = "Unable to load times.";
        }
    };

    const geoOptions = {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
    };

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (position) => {
            try {
                const { latitude, longitude } = position.coords;
                await updateLocationName(latitude, longitude);
                // Method 3 is Muslim World League. Adjustment=1 helps with some regional variations.
                const response = await fetch(`https://api.aladhan.com/v1/timings?latitude=${latitude}&longitude=${longitude}&method=3`);
                const data = await response.json();
                if (data.data && data.data.timings) {
                    renderPrayers(data.data.timings);
                } else {
                    throw new Error("Invalid API response");
                }
            } catch (e) {
                console.error("Error processing location data:", e);
                fallback();
            }
        }, (error) => {
            console.warn("Geolocation error:", error.message);
            locationRetryBtn.classList.remove('hidden');
            fallback();
        }, geoOptions);
    } else {
        fallback();
    }
}

locationRetryBtn.onclick = fetchPrayerTimes;

const VERSE_POOL = [
    { text: "So verily, with every difficulty, there is relief.", ref: "Quran 94:5" },
    { text: "And He found you lost and guided you.", ref: "Quran 93:7" },
    { text: "Allah does not burden a soul beyond that it can bear.", ref: "Quran 2:286" },
    { text: "Call upon Me; I will respond to you.", ref: "Quran 40:60" },
    { text: "My mercy encompasses all things.", ref: "Quran 7:156" },
    { text: "Indeed, Allah is with the patient.", ref: "Quran 2:153" },
    { text: "The life of this world is only a playground and a distraction.", ref: "Quran 47:36" },
    { text: "Which of the favors of your Lord will you deny?", ref: "Quran 55:13" },
    { text: "Be patient; indeed, the promise of Allah is truth.", ref: "Quran 30:60" },
    { text: "He is with you wherever you are.", ref: "Quran 57:4" },
    { text: "Remember Me; I will remember you.", ref: "Quran 2:152" },
    { text: "Guide us to the straight path.", ref: "Quran 1:6" },
    { text: "Peace, a word from a Merciful Lord.", ref: "Quran 36:58" },
    { text: "Truly, in the remembrance of Allah do hearts find rest.", ref: "Quran 13:28" },
    { text: "If you are grateful, I will surely increase you.", ref: "Quran 14:7" },
    { text: "Good and evil are not equal. Repel evil with good.", ref: "Quran 41:34" },
    { text: "And speak to people good words.", ref: "Quran 2:83" },
    { text: "Allah is the Light of the heavens and the earth.", ref: "Quran 24:35" },
    { text: "Hold firmly to the rope of Allah all together.", ref: "Quran 3:103" }
];

async function fetchDailyVerse() {
    const random = VERSE_POOL[Math.floor(Math.random() * VERSE_POOL.length)];
    dailyVerseDiv.innerHTML = `
        <div class="verse-content">
            <p class="verse-text">"${random.text}"</p>
            <p class="verse-ref">${random.ref}</p>
        </div>
    `;
}

refreshVerseBtn.onclick = fetchDailyVerse;

// Global Events
sendBtn.onclick = handleUserMessage;
chatInput.onkeypress = (e) => {
    if (e.key === 'Enter') handleUserMessage();
};

init();