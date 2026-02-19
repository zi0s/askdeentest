// State & Configuration
const DEFAULT_COORDS = { lat: 51.5074, lon: -0.1278 }; // London
const STATE = {
    onboardingDone: localStorage.getItem('askdeen_v2_onboarding') === 'true',
    userData: JSON.parse(localStorage.getItem('askdeen_v2_user')) || { name: 'Friend', lang: 'en', theme: 'system' },
    credits: 15,
    prayerTimes: null,
    location: null,
    tasbihCount: 0,
    activeView: 'dashboard-view',
    qiblaAngle: 0,
    notificationTimers: [] // holds timeouts for scheduled notifications
};

// Elements
const views = document.querySelectorAll('.view');
const navItems = document.querySelectorAll('.nav-item');
const typewriterContainer = document.getElementById('typewriter-container');
const phaseContainers = document.querySelectorAll('.onboarding-phase');

// Navigation Logic
function switchView(viewId) {
    views.forEach(v => v.classList.remove('active'));
    const target = document.getElementById(viewId);
    if (target) {
        target.classList.add('active');
        STATE.activeView = viewId;
    }
    
    // Update nav icons
    navItems.forEach(nav => {
        if (nav.dataset.view === viewId) nav.classList.add('active');
        else nav.classList.remove('active');
    });
}

// Event Listeners for Navigation
navItems.forEach(nav => {
    nav.addEventListener('click', () => switchView(nav.dataset.view));
});

document.querySelectorAll('.back-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView('dashboard-view'));
});

document.querySelectorAll('.feature-item').forEach(feat => {
    feat.addEventListener('click', () => {
        const target = feat.dataset.target;
        if (target) switchView(`${target}-view`);
    });
});

const WISDOM_DATA = [
    { text: "Verily, with hardship comes ease.", source: "Surah Ash-Sharh 94:6" },
    { text: "Allah does not burden a soul beyond that it can bear.", source: "Surah Al-Baqarah 2:286" },
    { text: "The best of you are those who are best to their families.", source: "Prophet Muhammad (PBUH)" },
    { text: "Kindness is a mark of faith, and whoever is not kind has no faith.", source: "Prophet Muhammad (PBUH)" },
    { text: "The strongest among you is the one who controls his anger.", source: "Prophet Muhammad (PBUH)" },
    { text: "He who has no compassion will receive no compassion.", source: "Prophet Muhammad (PBUH)" },
    { text: "Be mindful of Allah and He will protect you.", source: "Prophet Muhammad (PBUH)" }
];

// Settings & Theme
function applyTheme(theme) {
    const root = document.documentElement;
    // Accept: 'light' | 'dark' | 'system'
    if (theme === 'system') {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.setAttribute('data-theme', isDark ? 'dark' : 'light');
    } else {
        root.setAttribute('data-theme', theme);
    }
    // Visual active state for buttons
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === theme);
    });
}

document.getElementById('settings-trigger-btn').addEventListener('click', () => switchView('settings-view'));

document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        STATE.userData.theme = btn.dataset.theme;
        localStorage.setItem('askdeen_v2_user', JSON.stringify(STATE.userData));
        applyTheme(STATE.userData.theme);
    });
});

document.getElementById('lang-select').addEventListener('change', (e) => {
    STATE.userData.lang = e.target.value;
    localStorage.setItem('askdeen_v2_user', JSON.stringify(STATE.userData));
    // Implementation for text change would go here
});

// --- Prayer Times Logic ---
async function fetchPrayerTimes(lat, lon, cityName) {
    try {
        const res = await fetch(`https://api.aladhan.com/v1/timings?latitude=${lat}&longitude=${lon}&method=2`);
        const data = await res.json();
        STATE.prayerTimes = data.data.timings;
        STATE.location = cityName || "Nearby Location";
        renderPrayerUI();
        // schedule notifications based on latest prayer times
        schedulePrayerNotifications();
    } catch (e) {
        console.error("Prayer times error", e);
    }
}

function renderPrayerUI() {
    if (!STATE.prayerTimes) return;
    const nextPrayer = getNextPrayer();
    document.getElementById('next-prayer-name').textContent = nextPrayer.name;
    document.getElementById('next-prayer-time').textContent = nextPrayer.time;
    // Show a readable location or fallback
    const locText = STATE.location || 'No location';
    document.getElementById('current-location-text').textContent = locText;
    const prayersLocationEl = document.getElementById('prayers-location');
    if (prayersLocationEl) prayersLocationEl.textContent = locText;

    // Update Track Fajr card progress
    const tracked = loadTrackedPrayers();
    const trackedCount = Object.values(tracked).filter(Boolean).length;
    const trackCard = document.querySelector('.track-content p');
    if (trackCard) trackCard.textContent = `${trackedCount}/5 tracked`;

    // Build full list with per-prayer timers and disabled checkboxes unless it's the active prayer
    const list = document.getElementById('full-prayer-list');
    const displayNames = { Fajr: 'Fajr', Dhuhr: 'Dhuhr', Asr: 'Asr', Maghrib: 'Maghrib', Isha: 'Isha' };
    list.innerHTML = Object.entries(displayNames).map(([key, label]) => {
        const time = STATE.prayerTimes[key] || '--:--';
        const isActive = nextPrayer.name === label;
        const checked = tracked[label] ? 'checked' : '';
        const last = tracked[label] ? `<div class="tracked-time">Last: ${new Date(tracked[label]).toLocaleString()}</div>` : '';
        // each row includes a small countdown for that prayer
        return `
            <div class="prayer-row ${isActive ? 'active' : ''}" data-prayer="${label}" data-time="${time}">
                <div class="prayer-info">
                    <strong>${label}</strong>
                    ${last}
                </div>
                <div class="prayer-right">
                    <div>
                        <div class="prayer-time">${time}</div>
                        <div class="prayer-timer" data-timer-for="${label}"></div>
                    </div>
                    <label class="track-checkbox">
                        <input type="checkbox" data-prayer="${label}" ${checked} ${isActive ? '' : 'disabled'}>
                        <span>Tracked</span>
                    </label>
                </div>
            </div>
        `;
    }).join('');

    // Wire checkbox listeners: only active prayer checkbox is enabled
    document.querySelectorAll('.track-checkbox input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const name = e.target.dataset.prayer;
            const isChecked = e.target.checked;
            // Only allow checking if enabled (should already be disabled otherwise)
            if (e.target.disabled) return;
            toggleTrackedPrayer(name, isChecked);
            if (isChecked && window.navigator.vibrate) window.navigator.vibrate(30);
            // update progress text
            const tracked = loadTrackedPrayers();
            const trackedCount = Object.values(tracked).filter(Boolean).length;
            const trackCard = document.querySelector('.track-content p');
            if (trackCard) trackCard.textContent = `${trackedCount}/5 tracked`;
            // refresh to reflect last time
            renderPrayerUI();
        });
    });

    // initialize per-prayer timers
    updatePerPrayerTimers();
}

function getNextPrayer() {
    if (!STATE.prayerTimes) return { name: '...', time: '--:--' };
    const now = new Date();
    const times = [
        { name: 'Fajr', time: STATE.prayerTimes.Fajr },
        { name: 'Dhuhr', time: STATE.prayerTimes.Dhuhr },
        { name: 'Asr', time: STATE.prayerTimes.Asr },
        { name: 'Maghrib', time: STATE.prayerTimes.Maghrib },
        { name: 'Isha', time: STATE.prayerTimes.Isha },
    ];

    for (const p of times) {
        const [h, m] = p.time.split(':');
        const pDate = new Date();
        pDate.setHours(h, m, 0);
        if (pDate > now) return p;
    }
    return times[0]; // Next day's Fajr
}

function updateCountdown() {
    if (!STATE.prayerTimes) return;
    const next = getNextPrayer();
    const now = new Date();
    const [h, m] = next.time.split(':');
    let pDate = new Date();
    pDate.setHours(h, m, 0);
    if (pDate < now) pDate.setDate(pDate.getDate() + 1);

    const diff = pDate - now;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    document.getElementById('next-prayer-countdown').textContent = `in ${hours}h ${mins}m`;

    // update per-prayer timers too
    updatePerPrayerTimers();
}

// helper: update timers shown in each prayer-row
function updatePerPrayerTimers() {
    if (!STATE.prayerTimes) return;
    const now = new Date();
    document.querySelectorAll('.prayer-row').forEach(row => {
        const label = row.dataset.prayer;
        const timeStr = row.dataset.time;
        const timerEl = row.querySelector('.prayer-timer');
        if (!timeStr || !timerEl) return;
        const [hh, mm] = timeStr.split(':').map(Number);
        let pDate = new Date();
        pDate.setHours(hh, mm, 0);
        // if scheduled time earlier than now, treat as today passed (allow checking) but compute next occurrence for countdown
        const occurred = pDate <= now;
        if (occurred) {
            // countdown to next occurrence (tomorrow)
            const tomorrow = new Date(pDate);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const diff = tomorrow - now;
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            timerEl.textContent = `${hours}h ${mins}m`;
        } else {
            const diff = pDate - now;
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            timerEl.textContent = `${hours}h ${mins}m`;
        }
        // enable checkbox for prayers that have already occurred (past) or the current next prayer; disable future ones
        const checkbox = row.querySelector('input[type="checkbox"]');
        const nextPrayer = getNextPrayer();
        if (checkbox) {
            const isNext = nextPrayer.name === label;
            checkbox.disabled = (!occurred && !isNext);
        }
    });
}

// Location Handling


function requestAndFetchLocation() {
    if (!navigator.geolocation) {
        showLocationNeededModal();
        return;
    }
    navigator.geolocation.getCurrentPosition(
        async pos => {
            // detect language and get a friendly location name
            const name = await detectLanguageFromCoords(pos.coords.latitude, pos.coords.longitude);
            fetchPrayerTimes(pos.coords.latitude, pos.coords.longitude, name);
        },
        err => {
            // Show helpful modal asking user to allow or enter manually
            showLocationNeededModal();
        },
        { enableHighAccuracy: true, timeout: 8000 }
    );
}

/* Manual city entry removed to reduce user error; location should be set via browser prompt.
   Keep the 'Automatic' button active to request permission again. */
document.getElementById('manual-location-btn')?.remove?.();
document.getElementById('submit-city-btn')?.remove?.();
document.getElementById('city-input')?.remove?.();

// --- Tasbih Logic ---
document.getElementById('tasbih-trigger').onclick = () => {
    STATE.tasbihCount++;
    document.getElementById('tasbih-counter').textContent = STATE.tasbihCount;
    // Tiny haptic feedback if available
    if (window.navigator.vibrate) window.navigator.vibrate(20);
};

document.getElementById('reset-tasbih').onclick = () => {
    STATE.tasbihCount = 0;
    document.getElementById('tasbih-counter').textContent = STATE.tasbihCount;
};

// --- AskDeen AI Disclaimer Flow ---
document.getElementById('askdeen-feature').onclick = () => {
    switchView('askdeen-view');
    const btn = document.getElementById('disclaimer-continue-btn');
    const timerText = document.getElementById('disclaimer-timer');
    let timeLeft = 5;
    
    btn.classList.add('hidden');
    btn.disabled = true;
    timerText.classList.remove('hidden');

    const interval = setInterval(() => {
        timeLeft--;
        timerText.textContent = `Please wait ${timeLeft} seconds...`;
        if (timeLeft <= 0) {
            clearInterval(interval);
            timerText.classList.add('hidden');
            btn.classList.remove('hidden');
            btn.disabled = false;
        }
    }, 1000);
};

document.getElementById('disclaimer-continue-btn').onclick = () => {
    document.getElementById('disclaimer-content').classList.remove('active');
    document.getElementById('coming-soon-content').classList.remove('hidden');
};

// --- Typewriter Helper ---
async function typeText(text, container, totalTimeMs = 4500) {
    // Use Array.from to avoid splitting combining characters / diacritics (fixes doubled letters)
    container.textContent = '';
    const chars = Array.from(text);
    const delay = Math.max(6, Math.floor(totalTimeMs / chars.length));
    for (let char of chars) {
        container.textContent += char;
        await new Promise(r => setTimeout(r, delay));
    }
}

// --- Onboarding Flow ---
async function startOnboarding() {
    // clearer, single-spaced greeting to avoid doubled characters
    await typeText("As-salamu alaykum. Before we continue, we'd like to ask a couple of questions.", typewriterContainer, 4000);
    document.getElementById('onboarding-phase-1').classList.remove('hidden');
}

document.getElementById('start-onboarding-btn').onclick = async () => {
    document.getElementById('onboarding-phase-1').classList.add('hidden');
    await typeText("What is your name?", typewriterContainer, 1500);
    document.getElementById('onboarding-phase-2').classList.remove('hidden');
};

document.getElementById('submit-name-btn').onclick = async () => {
    const name = document.getElementById('user-name-input').value.trim();
    if (!name) return;
    STATE.userData.name = name;
    document.getElementById('onboarding-phase-2').classList.add('hidden');
    await typeText(`Mā shā’ Allāh, ${name}! That is a beautiful name. How often do you pray?`, typewriterContainer, 2500);
    document.getElementById('onboarding-phase-3').classList.remove('hidden');
};

document.querySelectorAll('.option-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const phase = btn.closest('.onboarding-phase').id;
        const val = btn.dataset.value;
        
        btn.closest('.onboarding-phase').classList.add('hidden');
        if (phase === 'onboarding-phase-3') {
            if (val === 'everyday') {
                await typeText("Mā shā’ Allāh! How many times a day do you pray?", typewriterContainer, 2000);
                document.getElementById('onboarding-phase-4').classList.remove('hidden');
            } else {
                await typeText("What prevents you from praying regularly?", typewriterContainer, 2000);
                document.getElementById('onboarding-phase-5').classList.remove('hidden');
            }
        } else if (phase === 'onboarding-phase-4' || phase === 'onboarding-phase-5') {
            await typeText("Welcome to AskDeen.", typewriterContainer, 2000);
            document.getElementById('onboarding-phase-6').classList.remove('hidden');
        }
    });
});

document.getElementById('finish-onboarding-btn').onclick = finishOnboarding;
document.getElementById('skip-onboarding-btn').onclick = finishOnboarding;

// Auto-focus name input when phase 2 shows
const nameObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.target.id === 'onboarding-phase-2' && !mutation.target.classList.contains('hidden')) {
            document.getElementById('user-name-input').focus();
        }
    });
});
nameObserver.observe(document.getElementById('onboarding-phase-2'), { attributes: true, attributeFilter: ['class'] });

function finishOnboarding() {
    localStorage.setItem('askdeen_v2_onboarding', 'true');
    localStorage.setItem('askdeen_v2_user', JSON.stringify(STATE.userData));
    showDashboard();
}

function showDashboard() {
    document.getElementById('welcome-screen').classList.add('hidden');
    document.getElementById('main-content').classList.remove('hidden');
    document.getElementById('display-user-name').textContent = STATE.userData.name;
    switchView('dashboard-view');
}

// Qibla Mock Logic (Real compass requires DeviceOrientation API)
function initQibla() {
    let angle = 0;
    setInterval(() => {
        angle = (angle + 1) % 360;
        const needle = document.getElementById('compass-needle');
        if (needle) needle.style.transform = `rotate(${angle}deg)`;
    }, 100);
}

function applyLanguage(lang) {
    // minimal translations for key UI strings
    const greetings = {
        en: "As-salamu alaykum. Before we continue, we'd like to ask a couple of questions.",
        ar: "السلام عليكم. قبل المتابعة، نود أن نطرح بعض الأسئلة.",
        tr: "Esselâmü aleyküm. Devam etmeden önce birkaç soru sormak istiyoruz."
    };
    const namePrompt = { en: "What is your name?", ar: "ما اسمك؟", tr: "Adın nedir?" };
    const startBtn = document.getElementById('start-onboarding-btn');
    if (startBtn) startBtn.textContent = { en: "Yes, let's start", ar: "نعم، لنبدأ", tr: "Evet, başlayalım" }[lang] || "Yes, let's start";
    // set typewriter default strings where used on onboarding
    // store language in state and set select
    STATE.userData.lang = lang;
    const langSelect = document.getElementById('lang-select');
    if (langSelect) langSelect.value = lang;
    // update greeting text shown after onboarding
    const greetingEl = document.querySelector('.greeting-text');
    if (greetingEl) greetingEl.firstChild && (greetingEl.firstChild.textContent = (lang === 'ar' ? 'وعليكم السلام, ' : (lang === 'tr' ? 'Esselâmü Aleyküm, ' : 'Assalamu Alaykum, ')));
}

function detectLanguageFromNavigator() {
    const lang = (navigator.language || navigator.userLanguage || 'en').slice(0,2);
    if (['ar','tr','en'].includes(lang)) applyLanguage(lang);
    else applyLanguage('en');
}

// Show modal when location is required
function showLocationNeededModal() {
    const modal = document.getElementById('location-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    // Allow button: request location now
    const allowBtn = document.getElementById('location-allow-btn');
    if (allowBtn) {
        allowBtn.onclick = () => {
            modal.classList.add('hidden');
            requestAndFetchLocation();
        };
    }

    // Later button: dismiss modal and schedule a re-prompt
    const laterBtn = document.getElementById('location-later-btn');
    if (laterBtn) {
        laterBtn.onclick = () => {
            modal.classList.add('hidden');
            scheduleLaterReprompt();
        };
    }
}

// Prayer tracking persistence
function loadTrackedPrayers() {
    const raw = localStorage.getItem('askdeen_v2_tracked') || '{}';
    try { return JSON.parse(raw); } catch { return {}; }
}
function saveTrackedPrayers(obj) {
    localStorage.setItem('askdeen_v2_tracked', JSON.stringify(obj));
}
function toggleTrackedPrayer(prayerName, checked) {
    const tracked = loadTrackedPrayers();
    tracked[prayerName] = checked ? new Date().toISOString() : null;
    saveTrackedPrayers(tracked);
    // Update UI if needed
}

// Enhanced language detection from reverse geocode (best-effort)
async function detectLanguageFromCoords(lat, lon) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
        const data = await res.json();

        // Set language based on country code if possible
        const countryCode = (data.address && data.address.country_code) || '';
        if (['sa','ae','eg','iq','dz','ma','tn','om','kw'].includes(countryCode)) {
            applyLanguage('ar');
        } else {
            detectLanguageFromNavigator();
        }

        // Best-effort friendly place name: prefer city/town/village, else county, else country
        const addr = data.address || {};
        const city = addr.city || addr.town || addr.village || addr.hamlet || addr.county || '';
        const country = addr.country || '';
        const name = city ? (country ? `${city}, ${country}` : city) : (country || `${lat.toFixed(3)}, ${lon.toFixed(3)}`);
        return name;
    } catch {
        detectLanguageFromNavigator();
        return `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
    }
}

/* Notification scheduling helpers */
function clearScheduledNotifications() {
    if (STATE.notificationTimers && STATE.notificationTimers.length) {
        STATE.notificationTimers.forEach(t => clearTimeout(t));
    }
    STATE.notificationTimers = [];
}

// schedule notifications for the next occurrence of each prayer using STATE.prayerTimes
function schedulePrayerNotifications() {
    clearScheduledNotifications();
    if (!STATE.prayerTimes) return;
    // Only schedule if user has granted notification permission and a push token exists OR we can show local notifications
    const pushToken = localStorage.getItem('askdeen_push_token');
    const canNotify = (Notification && Notification.permission === 'granted');
    if (!canNotify) return;

    const prayers = ['Fajr','Dhuhr','Asr','Maghrib','Isha'];
    const now = new Date();

    prayers.forEach(name => {
        const timeStr = STATE.prayerTimes[name];
        if (!timeStr) return;
        const [hh, mm] = timeStr.split(':').map(Number);
        let when = new Date();
        when.setHours(hh, mm, 0, 0);
        // If the time already passed today, schedule for tomorrow
        if (when <= now) when.setDate(when.getDate() + 1);
        const delay = when - now;
        const t = setTimeout(async () => {
            // show a notification via service worker if available, else via Notification API
            const title = `Hey, it’s time to pray ${name} ❤️`;
            const body = `It's prayer time for ${name}.`;
            try {
                const swReg = window.__swRegistration || await navigator.serviceWorker.getRegistration();
                if (swReg && swReg.showNotification) {
                    swReg.showNotification(title, { body, icon: "/askdeen_icon.png", tag: `prayer-${name}` });
                } else if (Notification && Notification.permission === 'granted') {
                    new Notification(title, { body, icon: "/askdeen_icon.png", tag: `prayer-${name}` });
                }
            } catch (e) {
                console.error('notification send error', e);
            }

            // After firing, schedule the next occurrence (same prayer next day)
            const nextDelay = 24 * 60 * 60 * 1000; // 1 day
            const nextTimer = setTimeout(arguments.callee, nextDelay);
            STATE.notificationTimers.push(nextTimer);
        }, delay);
        STATE.notificationTimers.push(t);
    });
}

// allow external toggles to cancel schedules
window.addEventListener('askdeen:notifications-disabled', () => {
    clearScheduledNotifications();
});
window.addEventListener('askdeen:notifications-enabled', () => {
    // re-schedule using current prayerTimes
    schedulePrayerNotifications();
});

/* Duas sample data (expanded) */
const DUAS = [
    { title: "Morning Dua", text: "اللهم بك أصبحنا وبك أمسينا", transliteration: "Allahumma bika asbahna wa bika amsayna", en: "O Allah, by You we enter the morning and by You we enter the evening." },
    { title: "Evening Dua", text: "اللهم إني أمسيت أشهدك", transliteration: "Allahumma inni amsaytu ashhaduka", en: "O Allah, I enter the evening and witness You." },
    { title: "Before Sleep", text: "باسمك ربي وضعت جنبي", transliteration: "Bismika rabbi wada'tu janbi", en: "In Your name, my Lord, I lie down." },
    { title: "Travel Dua", text: "اللهم أنت الصاحب في السفر", transliteration: "Allahumma anta as-sahibu fis-safar", en: "O Allah, You are the companion on the journey." },
    { title: "Seeking Forgiveness", text: "أستغفر الله العظيم", transliteration: "Astaghfirullah al-azim", en: "I seek forgiveness from Allah, the Great." },
    { title: "For Parents", text: "رب اغفر لي ولوالديَّ", transliteration: "Rabbi ighfir li wa liwalidayya", en: "My Lord, forgive me and my parents." },
    { title: "For Guidance", text: "اللهم اهدني وسددني", transliteration: "Allahumma ihdini wasaddidni", en: "O Allah, guide me and keep me steadfast." },
    { title: "When in Distress", text: "لا إله إلا أنت سبحانك إني كنت من الظالمين", transliteration: "La ilaha illa anta subhanaka inni kuntu minaz-zalimin", en: "There is no deity but You; glory be to You; I was surely among the wrongdoers." },
    { title: "Gratitude", text: "اللهم لك الحمد كما ينبغي لجلال وجهك", transliteration: "Allahumma laka al-hamdu kama yanbaghi lijalali wajhika", en: "O Allah, to You belongs all praise as befits the majesty of Your Face." },
    { title: "Entering Home", text: "اللهم إني أسألك خير المسألة", transliteration: "Allahumma inni as'aluka khayral-mas'alah", en: "O Allah, I ask You for the best of requests." },
    { title: "Before Eating", text: "بسم الله", transliteration: "Bismillah", en: "In the name of Allah." },
    { title: "After Eating", text: "الحمد لله", transliteration: "Alhamdulillah", en: "Praise be to Allah." },
    { title: "For Sickness", text: "اللهم اشفِ مرضانا", transliteration: "Allahumma ishfi maradana", en: "O Allah, cure our sick ones." },
    { title: "For Sustenance", text: "اللهم ارزقنا رزقا حلالا طيبا", transliteration: "Allahumma arzuqna rizqan halalan tayyiban", en: "O Allah, grant us lawful and good sustenance." },
    { title: "Protection", text: "أعوذ بالله من الشيطان الرجيم", transliteration: "A'udhu billahi minash-shaytanir-rajim", en: "I seek refuge in Allah from the accursed devil." },
    { title: "Before Exam", text: "اللهم لا سهل إلا ما جعلته سهلا", transliteration: "Allahumma la sahla illa ma ja'altahu sahla", en: "O Allah, there is no ease except what You make easy." }
];

function populateDuas() {
    const list = document.getElementById('dua-list');
    const render = (arr) => {
        list.innerHTML = arr.map((d, i) => `
            <div class="dua-item" data-index="${i}">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <h4>${d.title}</h4>
                    <div style="display:flex;gap:8px;">
                        <button class="btn-secondary copy-dua" data-idx="${i}">Copy</button>
                        <button class="btn-primary toggle-lang" data-idx="${i}">EN</button>
                    </div>
                </div>
                <p class="dua-ar">${d.text}</p>
                <p class="dua-trans" style="display:none;color:var(--text-muted);font-style:italic;">${d.transliteration || ''}</p>
                <p class="dua-en" style="display:none;color:var(--text-muted);">${d.en || ''}</p>
            </div>
        `).join('');
        // copy behavior
        document.querySelectorAll('.copy-dua').forEach(btn => {
            btn.onclick = () => {
                const i = Number(btn.dataset.idx);
                const text = DUAS[i].text + (DUAS[i].transliteration ? `\n${DUAS[i].transliteration}` : '');
                navigator.clipboard?.writeText(text).then(()=> {
                    const prev = btn.textContent;
                    btn.textContent = 'Copied';
                    setTimeout(()=> btn.textContent = prev, 1400);
                });
            };
        });
        // toggle language button: cycles AR -> Transliteration -> EN
        document.querySelectorAll('.toggle-lang').forEach(btn => {
            btn.onclick = () => {
                const idx = Number(btn.dataset.idx);
                const item = document.querySelector(`.dua-item[data-index="${idx}"]`);
                const ar = item.querySelector('.dua-ar');
                const trans = item.querySelector('.dua-trans');
                const en = item.querySelector('.dua-en');
                if (ar.style.display !== 'none') {
                    ar.style.display = 'none';
                    trans.style.display = DUAS[idx].transliteration ? 'block' : 'none';
                    btn.textContent = 'TR';
                } else if (trans && trans.style.display !== 'none') {
                    trans.style.display = 'none';
                    en.style.display = DUAS[idx].en ? 'block' : 'none';
                    btn.textContent = 'EN';
                } else {
                    if (DUAS[idx].text) ar.style.display = 'block';
                    trans.style.display = 'none';
                    en.style.display = 'none';
                    btn.textContent = 'AR';
                }
            };
        });
    };

    // initial render
    render(DUAS);

    // search wiring
    const search = document.getElementById('dua-search');
    if (search) {
        search.addEventListener('input', (e) => {
            const q = e.target.value.trim().toLowerCase();
            if (!q) return render(DUAS);
            const filtered = DUAS.filter(d => {
                return (d.title && d.title.toLowerCase().includes(q)) ||
                       (d.text && d.text.toLowerCase().includes(q)) ||
                       (d.transliteration && d.transliteration.toLowerCase().includes(q)) ||
                       (d.en && d.en.toLowerCase().includes(q));
            });
            render(filtered);
        });
    }
}

// Mosque map embed helper
async function fetchNearbyMosques(lat, lon, radius = 5000) {
    // Use Overpass API to find nearby Muslim places of worship (best-effort)
    try {
        const query = `[out:json][timeout:10];
            (
              node["amenity"="place_of_worship"]["religion"="muslim"](around:${radius},${lat},${lon});
              way["amenity"="place_of_worship"]["religion"="muslim"](around:${radius},${lat},${lon});
              relation["amenity"="place_of_worship"]["religion"="muslim"](around:${radius},${lat},${lon});
            );
            out center 20;`;
        const res = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `data=${encodeURIComponent(query)}`
        });
        const data = await res.json();
        // map results to simple array
        const places = (data.elements || []).map(el => {
            const name = (el.tags && (el.tags.name || el.tags['name:en'])) || 'Mosque';
            const latc = el.lat || (el.center && el.center.lat);
            const lonc = el.lon || (el.center && el.center.lon);
            const addr = (el.tags && (el.tags['addr:full'] || el.tags['addr:street'] || '')) || '';
            return { name, lat: latc, lon: lonc, addr };
        }).filter(p => p.lat && p.lon);
        // sort by distance
        places.sort((a,b) => {
            const da = (a.lat - lat)**2 + (a.lon - lon)**2;
            const db = (b.lat - lat)**2 + (b.lon - lon)**2;
            return da - db;
        });
        return places;
    } catch (e) {
        console.error('Overpass error', e);
        return [];
    }
}

async function updateMosqueMap(lat, lon) {
    const container = document.getElementById('mosque-list');
    container.innerHTML = `<div style="padding:1rem;">Searching for nearby mosques...</div>`;
    const places = await fetchNearbyMosques(lat, lon, 8000);
    if (!places || places.length === 0) {
        container.innerHTML = `
            <div class="mosque-item">
                <div class="mosque-info">
                    <h4>No nearby mosques found</h4>
                    <p>Try allowing location or increase search radius.</p>
                </div>
            </div>
        `;
        return;
    }
    // render up to 5 results, nearest first
    container.innerHTML = places.slice(0,5).map((p, i) => {
        // maps link - prefer Apple Maps on iOS, Google Maps otherwise
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        const mapsUrl = isIOS
            ? `https://maps.apple.com/?q=${encodeURIComponent(p.name)}&ll=${p.lat},${p.lon}`
            : `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`;
        return `
            <div class="mosque-item" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.8rem;">
                <div class="mosque-info" style="flex:1;margin-right:0.6rem;">
                    <h4 style="margin:0 0 6px 0;">${p.name}</h4>
                    <p style="margin:0;color:var(--text-muted);font-size:0.9rem;">${p.addr || 'Address not available'}</p>
                </div>
                <div>
                    <button class="btn-primary" data-lat="${p.lat}" data-lon="${p.lon}" onclick="window.open('${mapsUrl}','_blank')">Directions</button>
                </div>
            </div>
        `;
    }).join('');
}

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (STATE.userData.theme === 'system') applyTheme('system');
});

// Reset Data logic
const clearBtn = document.getElementById('clear-data-btn');
if (clearBtn) {
    clearBtn.onclick = () => {
        if (confirm("Are you sure you want to reset all data and onboarding?")) {
            localStorage.clear();
            window.location.reload();
        }
    };
}

/* Initial location attempt with interactive widget, plus "Later" re-prompt logic */
let laterPromptTimer = null;
let laterTimeoutMs = 2 * 60 * 1000; // 2 minutes

function updatePrayerWidgetForLocation(name, friendly = '') {
    const badge = document.getElementById('prayer-widget-location');
    const sub = document.getElementById('prayer-widget-sub');
    const prayersLoc = document.getElementById('prayers-location');
    if (badge) badge.textContent = name || 'No location';
    if (sub) sub.textContent = friendly || (name ? 'Using browser location' : 'Location needed for times');
    if (prayersLoc) prayersLoc.textContent = name || 'No location';
    // store into state
    STATE.location = name || null;
}

function clearLaterPrompt() {
    if (laterPromptTimer) {
        clearTimeout(laterPromptTimer);
        laterPromptTimer = null;
    }
}

/* When user clicks "Later" we schedule a re-prompt after 2 minutes.
   The modal (or widget) will reappear when the timer elapses. */
function scheduleLaterReprompt() {
    clearLaterPrompt();
    laterPromptTimer = setTimeout(() => {
        // show the lightweight widget prompt by highlighting the widget and showing modal
        const widget = document.getElementById('prayer-widget');
        if (widget) {
            widget.style.boxShadow = '0 8px 24px rgba(16,185,129,0.12)';
            setTimeout(()=> widget.style.boxShadow = '', 2500);
        }
        // also show modal if user previously dismissed
        showLocationNeededModal();
    }, laterTimeoutMs);
    // update subtext to reflect scheduled reminder
    const sub = document.getElementById('prayer-widget-sub');
    if (sub) sub.textContent = 'Will remind in 2 minutes';
}

/* wire widget buttons */
function wirePrayerWidgetButtons() {
    const allowBtn = document.getElementById('prayer-allow-btn');
    const laterBtn = document.getElementById('prayer-later-btn');

    if (allowBtn) {
        allowBtn.addEventListener('click', () => {
            // attempt to request location immediately
            requestAndFetchLocation();
            clearLaterPrompt();
            updatePrayerWidgetForLocation(STATE.location || 'Detecting...', '');
        });
    }
    if (laterBtn) {
        laterBtn.addEventListener('click', () => {
            // schedule re-prompt after 2 minutes
            scheduleLaterReprompt();
            // provide immediate feedback in widget
            const sub = document.getElementById('prayer-widget-sub');
            if (sub) sub.textContent = 'Will remind in 2 minutes';
        });
    }
}

/* enhanced init that sets sensible defaults and wires location/settings UI */
function initLocationAndData() {
    // Set initial widget values
    updatePrayerWidgetForLocation(STATE.location || 'No location', STATE.location ? 'Using saved location' : 'Location needed for times');
    wirePrayerWidgetButtons();

    // Try to get precise location first
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            async pos => {
                clearLaterPrompt();
                // get a friendly location name from reverse geocode and set language
                const name = await detectLanguageFromCoords(pos.coords.latitude, pos.coords.longitude);
                updatePrayerWidgetForLocation(name || `${pos.coords.latitude.toFixed(3)}, ${pos.coords.longitude.toFixed(3)}`, 'Using browser location');
                fetchPrayerTimes(pos.coords.latitude, pos.coords.longitude, name);
                updateMosqueMap(pos.coords.latitude, pos.coords.longitude);
                // reflect setting status
                const el = document.getElementById('location-status');
                if (el) el.textContent = 'Allowed';
            },
            err => {
                // fallback to default but prompt user via widget and modal
                fetchPrayerTimes(DEFAULT_COORDS.lat, DEFAULT_COORDS.lon, "London (Default)");
                updateMosqueMap(DEFAULT_COORDS.lat, DEFAULT_COORDS.lon);
                updatePrayerWidgetForLocation('No location', 'Permission needed');
                showLocationNeededModal();
                const el = document.getElementById('location-status');
                if (el) el.textContent = 'Denied / Not provided';
            },
            { enableHighAccuracy: true, timeout: 8000 }
        );
    } else {
        fetchPrayerTimes(DEFAULT_COORDS.lat, DEFAULT_COORDS.lon, "London (Default)");
        updateMosqueMap(DEFAULT_COORDS.lat, DEFAULT_COORDS.lon);
        updatePrayerWidgetForLocation('No location', 'Geolocation unavailable');
        showLocationNeededModal();
        const el = document.getElementById('location-status');
        if (el) el.textContent = 'Unavailable';
    }
}

/* Settings: wire change location button and show status */
function wireSettingsLocationControls() {
    // create UI elements if present
    const container = document.querySelector('#settings-view .settings-content');
    if (container && !document.getElementById('location-status')) {
        // insert small status row near top of settings (non-invasive)
        const statusRow = document.createElement('div');
        statusRow.className = 'settings-group';
        statusRow.innerHTML = `
            <label>Location</label>
            <div style="display:flex;gap:0.6rem;align-items:center;">
                <div id="location-status" style="flex:1;color:var(--text-muted);">Unknown</div>
                <button id="change-location-btn" class="btn-primary" style="padding:0.5rem 0.8rem;font-weight:700;">Change</button>
            </div>
        `;
        // insert before the clear data group if exists
        const clearGroup = container.querySelector('.settings-group:last-of-type');
        if (clearGroup) container.insertBefore(statusRow, clearGroup);
        else container.appendChild(statusRow);

        document.getElementById('change-location-btn').addEventListener('click', () => {
            if (confirm("Allow browser location now?")) {
                requestAndFetchLocation();
            }
        });
    }
}

/* click handler for prayers-location badge to request or change location (keeps previous behavior) */
function wirePrayersLocationClick() {
    const prayersLoc = document.getElementById('prayers-location');
    if (prayersLoc) {
        prayersLoc.style.cursor = 'pointer';
        prayersLoc.addEventListener('click', async () => {
            const hasLoc = STATE.location && STATE.location !== 'No location';
            if (!hasLoc) {
                // ask user to allow location
                if (confirm("No location set. Allow browser to detect your location?")) {
                    requestAndFetchLocation();
                } else {
                    scheduleLaterReprompt();
                }
            } else {
                // ask user whether to change
                if (confirm(`Your current location is set to: ${STATE.location}. Do you want to change it?`)) {
                    requestAndFetchLocation();
                } else {
                    // nothing
                }
            }
        });
    }
}

// Final initialization
function init() {
    detectLanguageFromNavigator();
    applyTheme(STATE.userData.theme);
    
    // Set daily wisdom
    const wisdom = WISDOM_DATA[Math.floor(Math.random() * WISDOM_DATA.length)];
    const wisdomText = document.getElementById('wisdom-text');
    const wisdomSource = document.getElementById('wisdom-source');
    if (wisdomText) wisdomText.textContent = `"${wisdom.text}"`;
    if (wisdomSource) wisdomSource.textContent = wisdom.source;

    populateDuas();

    setInterval(updateCountdown, 1000);
    initQibla();

    // wire settings and widget interactions
    wireSettingsLocationControls();
    wirePrayersLocationClick();

    initLocationAndData();

    if (STATE.onboardingDone) showDashboard();
    else startOnboarding();
}

init();

/* Export helper: copies core project files to clipboard as a single combined text blob.
   Can be triggered via the Export Project button in Settings or via Alt+1 (existing keyboard). */
async function exportProjectFiles(selectedFiles = []) {
    try {
        // if no selection passed, default to all core files
        const toFetch = (selectedFiles && selectedFiles.length) ? selectedFiles.slice() : ['index.html','app.js','style.css','manifest.json','sw.js','firebase-messaging-sw.js'];
        const results = {};
        await Promise.all(toFetch.map(async (name) => {
            try {
                const txt = await (await fetch(`/${name}`)).text();
                results[name] = txt;
            } catch {
                results[name] = null;
            }
        }));

        // combine into a single text blob in a GitHub-friendly format
        const combined = Object.entries(results).map(([name, content]) => `--- ${name} ---\n${content||''}`).join('\n\n');
        await navigator.clipboard.writeText(combined);

        // feedback toast
        const toast = document.createElement('div');
        toast.textContent = 'Selected files copied to clipboard';
        Object.assign(toast.style, { position:'fixed',bottom:'110px',left:'50%',transform:'translateX(-50%)',background:'var(--card-bg)',color:'var(--text-white)',padding:'10px 14px',borderRadius:'10px',boxShadow:'0 8px 24px rgba(0,0,0,0.3)',zIndex:9999 });
        document.body.appendChild(toast);
        setTimeout(()=> toast.remove(),1800);
    } catch (err) {
        console.error('Export project failed', err);
        alert('Failed to export selected project files. Check console for details.');
    }
}

// Modal wiring for selecting files to export
document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'export-confirm') {
        const checks = Array.from(document.querySelectorAll('.export-file')).filter(c => c.checked).map(c => c.value);
        exportProjectFiles(checks);
        document.getElementById('export-modal')?.classList.add('hidden');
    }
    if (e.target && e.target.id === 'export-cancel') {
        document.getElementById('export-modal')?.classList.add('hidden');
    }
});

// When pressing Alt+1 open the modal (instead of immediately copying)
window.addEventListener('keydown', async (e) => {
    if (e.altKey && e.key === '1') {
        e.preventDefault();
        document.getElementById('export-modal')?.classList.remove('hidden');
    }
});

// Wire the visible Export button in Settings (if present)
document.addEventListener('DOMContentLoaded', () => {
    const exportBtn = document.getElementById('export-project-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
            // optional confirm for accidental clicks
            const ok = confirm('Copy project files (index.html, app.js, style.css, manifest.json, sw.js, firebase-messaging-sw.js) to clipboard?');
            if (ok) await exportProjectFiles();
        });
    }
});

// Keep the existing keyboard shortcut as well
window.addEventListener('keydown', async (e) => {
    if (e.altKey && e.key === '1') {
        try {
            await exportProjectFiles();
        } catch (err) {
            console.error('Copy shortcut failed', err);
        }
    }
});