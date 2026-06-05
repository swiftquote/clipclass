// ClipClass Premium Flat UI & Firebase Authentication Controller
import { initializeApp } from "./lib/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "./lib/firebase-auth.js";

// Standard Firebase Config template
// Replace these with your actual Firebase project values if E2E production database checks are required.
const firebaseConfig = {
  apiKey: "AIzaSyAngHbnLgRMWxlwWzcC8qk_07pigfHXjNc",
  authDomain: "clipclass-app-97214.firebaseapp.com",
  projectId: "clipclass-app-97214",
  storageBucket: "clipclass-app-97214.firebasestorage.app",
  messagingSenderId: "218415903735",
  appId: "1:218415903735:web:09db277836f0b10810f4f2"
};

// Backend API Service Configuration (Set your deployed production domain here)
const BACKEND_URL = "https://mohammedhino-lipclass-backend.hf.space";

// Initialize Firebase App & Auth with Try-Catch boundary
let app = null;
let auth = null;
let isFirebaseClientActive = false;

try {
  // Only attempt to initialize if keys are not the placeholder template
  if (firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("FakeKey")) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    isFirebaseClientActive = true;
    console.log("✅ Firebase Client SDK initialized successfully.");
  } else {
    console.warn("⚠️ Firebase Client using placeholder keys. Activating Local Developer Session Fallback.");
  }
} catch (err) {
  console.warn("⚠️ Firebase Client initialization failed, activating Local Developer Session Fallback:", err.message);
}

async function initPopup() {
  // Common Elements
  const globalLoader = document.getElementById("global-loader");
  const authPanel = document.getElementById("auth-panel");
  const dashboardPanel = document.getElementById("dashboard-panel");
  const proBadge = document.getElementById("pro-badge");
  const signoutBtn = document.getElementById("signout-btn");
  
  // Auth Form Elements
  const authViewTitle = document.getElementById("auth-view-title");
  const authViewDesc = document.getElementById("auth-view-desc");
  const authEmail = document.getElementById("auth-email");
  const authPassword = document.getElementById("auth-password");
  const authPrimaryBtn = document.getElementById("auth-primary-btn");
  const authToggleLink = document.getElementById("auth-toggle-link");

  // Dashboard Elements
  const videoTitleEl = document.getElementById("detected-video-title");
  const generateBtn = document.getElementById("generate-btn");
  const btnText = generateBtn.querySelector(".btn-text");
  const powerpointBtn = document.getElementById("powerpoint-btn");
  const blooketBtn = document.getElementById("blooket-btn");
  const blooketInstructions = document.getElementById("blooket-instructions");
  
  const ageGroupSelect = document.getElementById("age-group-select");
  const ellLanguageSelect = document.getElementById("ell-language-select");
  const toggleTrivia = document.getElementById("toggle-trivia");
  const questionsCountSelect = document.getElementById("questions-count-select");
  const questionsCountGroup = document.getElementById("questions-count-group");
  const toggleTimestamps = document.getElementById("toggle-timestamps");
  const toggleTimestampsRow = document.getElementById("toggle-timestamps-row");
  
  const quotaValue = document.getElementById("quota-value");
  const quotaBarFill = document.getElementById("quota-bar-fill");
  const upgradeBtn = document.getElementById("upgrade-btn");
  
  const statusBlock = document.getElementById("status-block");
  const statusDesc = document.getElementById("status-desc");

  // Local State
  let activeVideoMetadata = null;
  let isTabParsingComplete = false;
  let currentAuthMode = "signup"; // "signup" or "login"
  let currentUser = null;
  let isDevModeActive = !isFirebaseClientActive;
  let userPlan = "free";
  let translationUsageCount = 0;

  // ==========================================
  // VIEW MANAGER METHODS
  // ==========================================
  function showView(viewName) {
    globalLoader.classList.add("hidden");
    authPanel.classList.add("hidden");
    dashboardPanel.classList.add("hidden");
    signoutBtn.classList.add("hidden");

    if (viewName === "loader") {
      globalLoader.classList.remove("hidden");
    } else if (viewName === "auth") {
      authPanel.classList.remove("hidden");
      toggleAuthMode(currentAuthMode); 
    } else if (viewName === "dashboard") {
      dashboardPanel.classList.remove("hidden");
      signoutBtn.classList.remove("hidden");
    }
  }

  function toggleAuthMode(mode) {
    currentAuthMode = mode;
    if (mode === "signup") {
      authViewTitle.textContent = "Welcome to ClipClass";
      authViewDesc.textContent = "Register a free account to generate 10 printable student workbooks per week.";
      authPrimaryBtn.querySelector(".btn-text").textContent = "Create Free Account";
      authToggleLink.innerHTML = 'Already have an account? <span class="link-text">Log In</span>';
    } else {
      authViewTitle.textContent = "Welcome Back";
      authViewDesc.textContent = "Sign in to access your classroom workbook studio dashboard.";
      authPrimaryBtn.querySelector(".btn-text").textContent = "Sign In";
      authToggleLink.innerHTML = 'Need an account? <span class="link-text">Create Account</span>';
    }
  }

  function showStatus(type, desc) {
    statusBlock.className = `status-block ${type}`;
    statusDesc.textContent = desc;
    statusBlock.classList.remove("hidden");
  }

  function setNotYouTubeState(message) {
    videoTitleEl.textContent = `NO VIDEO: ${message}`;
    videoTitleEl.style.color = "#FF6B62";
    showStatus("error", message);
    isTabParsingComplete = true;
    generateBtn.disabled = true;
    blooketBtn.disabled = true;
    blooketInstructions.classList.add("hidden");
  }

  function setVideoDetectedState(title) {
    videoTitleEl.textContent = `ACTIVE VIDEO DETECTED: ${title}`;
    videoTitleEl.style.color = "#94A3B8";
    statusBlock.classList.add("hidden");
    generateBtn.disabled = false;
    blooketBtn.disabled = false;
    blooketInstructions.classList.add("hidden");
    isTabParsingComplete = true;
  }

  // ==========================================
  // FETCH USER QUOTA & PLAN STATUS
  // ==========================================
  async function refreshUserQuota(user) {
    try {
      const token = await user.getIdToken();
      const statusResponse = await fetch(`${BACKEND_URL}/api/user-status`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      if (!statusResponse.ok) {
        throw new Error("Failed to load user quota from server.");
      }

      const statusData = await statusResponse.json();
      userPlan = statusData.plan || "free";
      translationUsageCount = statusData.translationUsageCount || 0;
      
      // Update Quota Values & Plan Badge
      if (statusData.plan === "pro") {
        proBadge.textContent = "PRO";
        proBadge.className = "pro-badge pro";
        quotaValue.textContent = "Unlimited";
        quotaBarFill.style.width = "100%";
        upgradeBtn.classList.add("hidden");

        // Unlock PRO features
        questionsCountSelect.disabled = false;
        questionsCountGroup.classList.remove("pro-locked");
        toggleTimestamps.disabled = false;
        toggleTimestampsRow.classList.remove("pro-locked");
      } else {
        proBadge.textContent = "FREE";
        proBadge.className = "pro-badge";
        upgradeBtn.classList.remove("hidden");
        upgradeBtn.innerHTML = '<svg class="crown-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:14px;height:14px;margin-right:6px;display:inline-block;vertical-align:middle;"><path d="M2 4L5 12L12 6L19 12L22 4L17 19H7L2 4Z" fill="currentColor"/><circle cx="12" cy="4" r="1.5" fill="currentColor"/><circle cx="2" cy="3.5" r="1" fill="currentColor"/><circle cx="22" cy="3.5" r="1" fill="currentColor"/></svg><span style="vertical-align:middle;">Upgrade to Lifetime PRO</span>';
        
        // Lock PRO features
        questionsCountSelect.value = "10";
        questionsCountSelect.disabled = true;
        questionsCountGroup.classList.add("pro-locked");
        toggleTimestamps.checked = false;
        toggleTimestamps.disabled = true;
        toggleTimestampsRow.classList.add("pro-locked");

        const used = statusData.usageCount || 0;
        const limit = statusData.limit || 10;
        const remaining = Math.max(0, limit - used);
        
        quotaValue.textContent = `${remaining} / ${limit} left`;
        
        const percent = Math.min(100, (remaining / limit) * 100);
        quotaBarFill.style.width = `${percent}%`;
        
        if (remaining <= 0) {
          generateBtn.disabled = true;
          showStatus("error", "You have completed your 10 free weekly generations. Upgrade to PRO for unlimited access!");
        }
      }
    } catch (err) {
      console.warn("User status check failed. Defaulting to safe display mode:", err.message);
      userPlan = "free";
      translationUsageCount = 0;
      proBadge.textContent = "FREE";
      quotaValue.textContent = "10 / 10 left";
      quotaBarFill.style.width = "100%";
      upgradeBtn.classList.remove("hidden");
      upgradeBtn.innerHTML = '<svg class="crown-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:14px;height:14px;margin-right:6px;display:inline-block;vertical-align:middle;"><path d="M2 4L5 12L12 6L19 12L22 4L17 19H7L2 4Z" fill="currentColor"/><circle cx="12" cy="4" r="1.5" fill="currentColor"/><circle cx="2" cy="3.5" r="1" fill="currentColor"/><circle cx="22" cy="3.5" r="1" fill="currentColor"/></svg><span style="vertical-align:middle;">Upgrade to Lifetime PRO</span>';
      
      // Lock PRO features on fallback
      questionsCountSelect.value = "10";
      questionsCountSelect.disabled = true;
      questionsCountGroup.classList.add("pro-locked");
      toggleTimestamps.checked = false;
      toggleTimestamps.disabled = true;
      toggleTimestampsRow.classList.add("pro-locked");
    }
  }

  // ==========================================
  // FIREBASE SESSION AUTH INITIALIZER & RETRY LISTENER
  // ==========================================
  if (isFirebaseClientActive && auth) {
    // Normal Production Firebase auth
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        currentUser = user;
        showView("loader");
        await refreshUserQuota(user);
        showView("dashboard");
        startTabDetection();
      } else {
        currentUser = null;
        showView("auth");
      }
    });
  } else {
    // Zero-Friction Developer Mock Auth Path
    // Triggers a beautiful simulation in under 800ms to evaluate E2E right now!
    console.log("[Dev Session] Activating mock teacher profile credentials...");
    currentUser = {
      uid: "dev-teacher-mock",
      email: "teacher@school.edu",
      getIdToken: async () => "dev-local-credentials-token-AQ.Ab8"
    };

    showView("loader");
    setTimeout(async () => {
      await refreshUserQuota(currentUser);
      showView("dashboard");
      startTabDetection();
    }, 800);
  }

  // ==========================================
  // AUTH ROW CLICKS & TOGGLES (Local Fallbacks included)
  // ==========================================
  authToggleLink.addEventListener("click", () => {
    if (currentAuthMode === "signup") {
      toggleAuthMode("login");
    } else {
      toggleAuthMode("signup");
    }
  });

  authPrimaryBtn.addEventListener("click", async () => {
    const email = authEmail.value.trim();
    const password = authPassword.value;

    if (!email || !password) {
      alert("Please fill in both Email and Password fields.");
      return;
    }

    if (password.length < 6) {
      alert("Password must be at least 6 characters long.");
      return;
    }

    authPrimaryBtn.disabled = true;
    authPrimaryBtn.querySelector(".btn-text").textContent = "Processing...";

    if (isFirebaseClientActive && auth) {
      try {
        if (currentAuthMode === "signup") {
          await createUserWithEmailAndPassword(auth, email, password);
        } else {
          await signInWithEmailAndPassword(auth, email, password);
        }
      } catch (err) {
        console.error("Firebase auth failed:", err);
        alert(`Authentication Failed: ${err.message}`);
        authPrimaryBtn.disabled = false;
        toggleAuthMode(currentAuthMode);
      }
    } else {
      // In Dev Mode, click instantly authenticates
      setTimeout(async () => {
        currentUser = {
          uid: `dev-user-${email.replace(/[^a-z0-9]/gi, '_')}`,
          email: email,
          getIdToken: async () => `dev-token-${email}`
        };
        isDevModeActive = true;
        authPrimaryBtn.disabled = false;
        toggleAuthMode(currentAuthMode);
        
        showView("loader");
        await refreshUserQuota(currentUser);
        showView("dashboard");
        startTabDetection();
      }, 500);
    }
  });

  signoutBtn.addEventListener("click", async () => {
    if (isFirebaseClientActive && auth) {
      try {
        await signOut(auth);
      } catch (err) {
        console.error("Sign out failure:", err);
      }
    } else {
      // Mock log out in dev mode
      showView("loader");
      setTimeout(() => {
        currentUser = null;
        showView("auth");
      }, 500);
    }
  });

  // Worksheet translation limit warning change listener
  ellLanguageSelect.addEventListener("change", () => {
    const hasTranslation = ellLanguageSelect.value !== "None";
    if (userPlan === "free" && hasTranslation && translationUsageCount >= 1) {
      showStatus("error", "Worksheet Translation is a premium feature. Free tier users are limited to exactly 1 translation workbook. Upgrade to PRO to translate unlimited classroom kits!");
      generateBtn.disabled = true;
    } else {
      // Restore state if valid
      if (isTabParsingComplete && activeVideoMetadata) {
        statusBlock.classList.add("hidden");
        generateBtn.disabled = false;
      }
    }
  });

  // ==========================================
  // STRIPE UPGRADE TO PRO HANDLER
  // ==========================================
  upgradeBtn.addEventListener("click", async () => {
    if (!currentUser) {
      showStatus("error", "Session expired. Please sign in to upgrade.");
      return;
    }

    upgradeBtn.disabled = true;
    upgradeBtn.innerHTML = '<div class="spinner-small" style="width:12px;height:12px;border:2px solid rgba(255,255,255,0.2);border-top-color:#fff;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;margin-right:6px;vertical-align:middle;"></div><span style="vertical-align:middle;">Preparing Checkout...</span>';
    showStatus("processing", "Connecting to Stripe secure billing portal...");

    try {
      const token = await currentUser.getIdToken();

      const response = await fetch(`${BACKEND_URL}/api/create-checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error("Failed to initialize billing session.");
      }

      const data = await response.json();
      if (!data.checkoutUrl) {
        throw new Error("Billing session URL not received.");
      }

      showStatus("success", "Billing portal loaded successfully! Opening tab...");
      
      // Open Stripe Checkout in a new tab
      chrome.tabs.create({ url: data.checkoutUrl });

      // Start periodic status checking to automatically refresh dashboard once paid
      let checkCount = 0;
      const intervalId = setInterval(async () => {
        checkCount++;
        if (checkCount > 30) {
          clearInterval(intervalId); // Stop after 30 checks (2.5 minutes)
        }
        await refreshUserQuota(currentUser);
      }, 5000);

    } catch (err) {
      showStatus("error", `Billing Failed: ${err.message}`);
    } finally {
      upgradeBtn.disabled = false;
      upgradeBtn.innerHTML = '<svg class="crown-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:14px;height:14px;margin-right:6px;display:inline-block;vertical-align:middle;"><path d="M2 4L5 12L12 6L19 12L22 4L17 19H7L2 4Z" fill="currentColor"/><circle cx="12" cy="4" r="1.5" fill="currentColor"/><circle cx="2" cy="3.5" r="1" fill="currentColor"/><circle cx="22" cy="3.5" r="1" fill="currentColor"/></svg><span style="vertical-align:middle;">Upgrade to Lifetime PRO</span>';
    }
  });

  // ==========================================
  // CORE GENERATOR EVENT HANDLER
  // ==========================================
  generateBtn.addEventListener("click", async () => {
    if (!isTabParsingComplete) {
      showStatus("error", "Analyzing YouTube active tab. Please wait...");
      return;
    }

    if (!activeVideoMetadata) {
      showStatus("error", "No educational YouTube video detected. Navigate to a video watch page first.");
      return;
    }

    if (!currentUser) {
      showStatus("error", "Session expired. Please sign in.");
      return;
    }

    const hasTranslation = ellLanguageSelect.value !== "None";
    if (userPlan === "free" && hasTranslation && translationUsageCount >= 1) {
      showStatus("error", "Worksheet Translation is a premium feature. Free tier users are limited to exactly 1 translation workbook. Upgrade to PRO to translate unlimited classroom kits!");
      return;
    }

    generateBtn.disabled = true;
    btnText.textContent = "Generating...";
    showStatus("processing", "Transcribing subtitles and synthesizing printable assets...");

    try {
      const token = await currentUser.getIdToken();

      const payload = {
        videoId: activeVideoMetadata.videoId,
        videoTitle: activeVideoMetadata.videoTitle,
        channelName: activeVideoMetadata.channelName,
        ageGroup: ageGroupSelect.value,
        translationLanguage: ellLanguageSelect.value,
        gamifiedTrivia: toggleTrivia.checked,
        questionsCount: parseInt(questionsCountSelect.value, 10) || 10,
        showTimestamps: toggleTimestamps.checked
      };

      const backendUrl = `${BACKEND_URL}/api/generate-kit`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); 

      const response = await fetch(backendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errText = "Server failed to compile kit.";
        try {
          const errJson = await response.json();
          errText = errJson.error || errText;
        } catch (_) {}
        throw new Error(errText);
      }

      const contentType = response.headers.get("Content-Type");
      if (!contentType || !contentType.includes("application/pdf")) {
        throw new Error("Invalid response received. PDF binary expected.");
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      
      const fileSlug = activeVideoMetadata.videoTitle
        .replace(/[^a-z0-9]/gi, '_')
        .replace(/_{2,}/g, '_')
        .substring(0, 25);

      a.download = `ClipClass_${fileSlug}_Ages_${payload.ageGroup}.pdf`;
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        window.URL.revokeObjectURL(downloadUrl);
        a.remove();
      }, 100);

      showStatus("success", "Worksheet package generated and downloaded successfully!");
      await refreshUserQuota(currentUser);

    } catch (err) {
      let errMsg = err.message;
      if (err.name === "AbortError") {
        errMsg = "Request timed out (60s). Check backend terminal logs.";
      }
      showStatus("error", `Compilation Failed: ${errMsg}`);
      if (currentUser) {
        await refreshUserQuota(currentUser);
      }
    } finally {
      btnText.textContent = "Generate Classroom Kit";
    }
  });

  // ==========================================
  // POWERPOINT GENERATOR EVENT HANDLER
  // ==========================================
  powerpointBtn.addEventListener("click", async () => {
    if (!isTabParsingComplete) {
      showStatus("error", "Analyzing YouTube active tab. Please wait...");
      return;
    }

    if (!activeVideoMetadata) {
      showStatus("error", "No educational YouTube video detected. Navigate to a video watch page first.");
      return;
    }

    if (!currentUser) {
      showStatus("error", "Session expired. Please sign in.");
      return;
    }

    powerpointBtn.disabled = true;
    const pptxBtnText = powerpointBtn.querySelector(".btn-text");
    pptxBtnText.textContent = "Generating Slides...";
    showStatus("processing", "Transcribing subtitles and generating pedagogical PowerPoint slide deck...");

    try {
      const token = await currentUser.getIdToken();

      const payload = {
        videoId: activeVideoMetadata.videoId,
        videoTitle: activeVideoMetadata.videoTitle,
        channelName: activeVideoMetadata.channelName,
        ageGroup: ageGroupSelect.value,
        theme: "Cobalt Blue"
      };

      const backendUrl = `${BACKEND_URL}/api/generate-powerpoint`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); 

      const response = await fetch(backendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errText = "Server failed to compile slide deck.";
        try {
          const errJson = await response.json();
          errText = errJson.error || errText;
        } catch (_) {}
        throw new Error(errText);
      }

      const contentType = response.headers.get("Content-Type");
      if (!contentType || !contentType.includes("application/vnd.openxmlformats-officedocument.presentationml.presentation")) {
        throw new Error("Invalid response received. PPTX file expected.");
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      
      const fileSlug = activeVideoMetadata.videoTitle
        .replace(/[^a-z0-9]/gi, '_')
        .replace(/_{2,}/g, '_')
        .substring(0, 25);

      a.download = `ClipClass_Slides_${fileSlug}_Ages_${payload.ageGroup}.pptx`;
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        window.URL.revokeObjectURL(downloadUrl);
        a.remove();
      }, 100);

      showStatus("success", "PowerPoint slide deck generated and downloaded successfully!");
      await refreshUserQuota(currentUser);

    } catch (err) {
      let errMsg = err.message;
      if (err.name === "AbortError") {
        errMsg = "Request timed out (60s). Check backend terminal logs.";
      }
      showStatus("error", `PowerPoint Generation Failed: ${errMsg}`);
      if (currentUser) {
        await refreshUserQuota(currentUser);
      }
    } finally {
      pptxBtnText.textContent = "Generate PowerPoint Slides";
      powerpointBtn.disabled = false;
    }
  });

  // ==========================================
  // BLOOKET GENERATOR EVENT HANDLER
  // ==========================================
  blooketBtn.addEventListener("click", async () => {
    if (!isTabParsingComplete) {
      showStatus("error", "Analyzing YouTube active tab. Please wait...");
      return;
    }

    if (!activeVideoMetadata) {
      showStatus("error", "No educational YouTube video detected. Navigate to a video watch page first.");
      return;
    }

    if (!currentUser) {
      showStatus("error", "Session expired. Please sign in.");
      return;
    }

    blooketBtn.disabled = true;
    const blooketBtnText = blooketBtn.querySelector(".btn-text");
    blooketBtnText.textContent = "Generating Game...";
    showStatus("processing", "Transcribing subtitles and generating Blooket 15-question game set...");
    blooketInstructions.classList.add("hidden");

    try {
      const token = await currentUser.getIdToken();

      const payload = {
        videoId: activeVideoMetadata.videoId,
        videoTitle: activeVideoMetadata.videoTitle,
        channelName: activeVideoMetadata.channelName,
        ageGroup: ageGroupSelect.value
      };

      const backendUrl = `${BACKEND_URL}/api/generate-blooket`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); 

      const response = await fetch(backendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errText = "Server failed to compile Blooket game.";
        try {
          const errJson = await response.json();
          errText = errJson.error || errText;
        } catch (_) {}
        throw new Error(errText);
      }

      const contentType = response.headers.get("Content-Type");
      if (!contentType || !contentType.includes("text/csv")) {
        throw new Error("Invalid response received. CSV text expected.");
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      
      const fileSlug = activeVideoMetadata.videoTitle
        .replace(/[^a-z0-9]/gi, '_')
        .replace(/_{2,}/g, '_')
        .substring(0, 25);

      a.download = `ClipClass_Blooket_${fileSlug}_Ages_${payload.ageGroup}.csv`;
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        window.URL.revokeObjectURL(downloadUrl);
        a.remove();
      }, 100);

      showStatus("success", "Blooket game CSV generated and downloaded successfully!");
      blooketInstructions.classList.remove("hidden");
      await refreshUserQuota(currentUser);

    } catch (err) {
      let errMsg = err.message;
      if (err.name === "AbortError") {
        errMsg = "Request timed out (60s). Check backend terminal logs.";
      }
      showStatus("error", `Blooket Generation Failed: ${errMsg}`);
      if (currentUser) {
        await refreshUserQuota(currentUser);
      }
    } finally {
      blooketBtnText.textContent = "Generate Blooket Game (15 Qs)";
      blooketBtn.disabled = false;
    }
  });

  // ==========================================
  // ACTIVE TAB CRAWLER
  // ==========================================
  async function startTabDetection() {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!activeTab || !activeTab.url) {
        setNotYouTubeState("Could not inspect active window.");
        return;
      }

      if (!activeTab.url.includes("youtube.com/watch")) {
        setNotYouTubeState("Navigate to a YouTube video watch page first.");
        return;
      }

      try {
        const urlObj = new URL(activeTab.url);
        const videoId = urlObj.searchParams.get("v");
        if (videoId) {
          activeVideoMetadata = {
            videoId: videoId,
            videoTitle: activeTab.title ? activeTab.title.replace(" - YouTube", "") : "YouTube Video",
            channelName: "YouTube Creator",
            url: activeTab.url
          };
          setVideoDetectedState(activeVideoMetadata.videoTitle);
        }
      } catch (e) {
        console.warn("Direct URL parser failed:", e);
      }

      chrome.tabs.sendMessage(activeTab.id, { action: "getVideoMetadata" }, (response) => {
        if (!chrome.runtime.lastError && response && response.success) {
          activeVideoMetadata = response;
          setVideoDetectedState(response.videoTitle);
        }
      });

    } catch (err) {
      console.error("Tab detection failed:", err);
      setNotYouTubeState("Tab detection failed.");
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPopup);
} else {
  initPopup();
}
