// ClipClass Node.js Express Server - Authenticated SaaS Quota Edition
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import Stripe from 'stripe';

import { fetchYouTubeTranscript } from './transcript.js';
import { generateWorksheetContent } from './ai.js';
import { compileWorkbookPDF } from './pdf.js';
import { generateBlooketContent } from './blooket.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Stripe if secret key is present
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

// ==========================================
// FIREBASE ADMIN SDK & CLOUD FIRESTORE INITIALIZATION
// ==========================================
let db = null;
let isFirebaseInitialized = false;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore();
    isFirebaseInitialized = true;
    console.log("✅ Secure Firebase Admin SDK & Cloud Firestore initialized successfully from Environment Variable!");
  } else {
    // Look for service account credentials file
    const serviceAccountPath = path.resolve('firebase-service-account.json');
    
    if (fs.existsSync(serviceAccountPath)) {
      const rawData = fs.readFileSync(serviceAccountPath);
      const serviceAccount = JSON.parse(rawData);
      
      // Initialize if key is not empty template
      if (serviceAccount.private_key_id && !serviceAccount.private_key_id.includes("PASTE_YOUR")) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
        db = admin.firestore();
        isFirebaseInitialized = true;
        console.log("✅ Secure Firebase Admin SDK & Cloud Firestore initialized successfully from file!");
      } else {
        console.warn("⚠️  firebase-service-account.json detected but contains default template keys.");
        console.warn("➡️  Activating Resilient In-Memory Local Database Fallback for local evaluation.");
      }
    } else {
      console.warn("⚠️  firebase-service-account.json credentials file not found.");
      console.warn("➡️  Activating Resilient In-Memory Local Database Fallback for local evaluation.");
    }
  }
} catch (err) {
  console.error("❌ Firebase Admin initialization yielded an exception:", err.message);
  console.warn("➡️  Activating Resilient In-Memory Local Database Fallback for local evaluation.");
}

// ==========================================
// RESILIENT IN-MEMORY LOCAL DATABASE FALLBACK
// ==========================================
const localMemoryDB = new Map(); // uid -> user document

/**
 * Creates or retrieves a user record from the local in-memory fallback database
 */
function getMockUserRecord(uid, email) {
  if (!localMemoryDB.has(uid)) {
    localMemoryDB.set(uid, {
      uid: uid,
      email: email || "test-teacher@school.edu",
      plan: "free",
      usageCount: 0,
      translationUsageCount: 0,
      lastReset: Date.now()
    });
    console.log(`[Mock DB] Created new local user record for UID: ${uid} (${email})`);
  }

  const record = localMemoryDB.get(uid);

  // Apply weekly reset check (7 days quota interval)
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - record.lastReset > oneWeekMs) {
    console.log(`[Mock DB] Weekly quota window expired for user ${uid}. Resetting usageCount to 0.`);
    record.usageCount = 0;
    record.lastReset = Date.now();
  }

  return record;
}

// ==========================================
// AUTHENTICATION MIDDLEWARE
// ==========================================
async function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized access: Missing Bearer Authentication Token." });
  }

  const token = authHeader.split("Bearer ")[1];

  // Path A: Firebase Admin Verification (Production Mode)
  if (isFirebaseInitialized) {
    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email
      };
      return next();
    } catch (authErr) {
      console.warn("Firebase Token verification failed, trying mock fallback:", authErr.message);
    }
  }

  // Path B: Local Auth Fallback (Developer Testing Mode)
  // Decodes simple mock tokens or standard developer payloads cleanly
  try {
    // If token exists, we mock verify it. If it contains "FakeKey" or is simple, extract a dummy uid.
    // We can hash or simply map the token to a mock uid so that multiple mock accounts can test simultaneously.
    const mockUid = `mock-uid-${token.substring(0, 8)}`;
    req.user = {
      uid: mockUid,
      email: "mock-teacher@school.edu"
    };
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid developer token payload." });
  }
}

// ==========================================
// EXPRESS MIDDLEWARES & ROUTERS
// ==========================================
app.use(cors({
  origin: '*',
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ==========================================
// LIVE STRIPE WEBHOOK LISTENER
// ==========================================
app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe) {
    console.warn("[Stripe Webhook] Webhook request ignored. Stripe is not initialized.");
    return res.status(400).json({ error: "Stripe not initialized" });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error(`❌ Stripe Webhook Signature Verification Failed:`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle checkout session completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const uid = session.metadata?.uid;

    if (uid) {
      console.log(`[Stripe Webhook] Successful payment received for user ${uid}. Upgrading plan to PRO!`);
      try {
        if (isFirebaseInitialized) {
          await db.collection('users').doc(uid).update({ plan: 'pro' });
        } else {
          const userDoc = getMockUserRecord(uid);
          userDoc.plan = 'pro';
        }
        console.log(`[Stripe Webhook] Successfully upgraded user ${uid} to PRO!`);
      } catch (dbErr) {
        console.error(`[Stripe Webhook] Failed to update user plan in DB:`, dbErr);
      }
    } else {
      console.warn("[Stripe Webhook] No UID found in session metadata.");
    }
  }

  res.json({ received: true });
});

app.use(express.json());

// Logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Diagnostics Health
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'healthy', databaseMode: isFirebaseInitialized ? 'firestore' : 'in-memory-fallback' });
});

// Public Privacy Policy HTML Page
app.get('/privacy-policy', (req, res) => {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>ClipClass Privacy Policy</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
      <style>
        body {
          font-family: 'Inter', sans-serif;
          line-height: 1.6;
          color: #334155;
          max-width: 680px;
          margin: 40px auto;
          padding: 0 20px;
          background-color: #f8fafc;
        }
        .container {
          background-color: #ffffff;
          padding: 40px;
          border-radius: 12px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
          border: 1px solid #f1f5f9;
        }
        h1 {
          color: #0f172a;
          font-size: 1.8rem;
          font-weight: 800;
          margin-bottom: 8px;
        }
        .date {
          color: #64748b;
          font-size: 0.88rem;
          margin-bottom: 24px;
        }
        h2 {
          color: #1e293b;
          font-size: 1.25rem;
          font-weight: 700;
          margin-top: 28px;
          margin-bottom: 12px;
        }
        p, li {
          font-size: 0.95rem;
        }
        ul {
          padding-left: 20px;
        }
        li {
          margin-bottom: 8px;
        }
        footer {
          margin-top: 40px;
          text-align: center;
          font-size: 0.8rem;
          color: #94a3b8;
        }
        a {
          color: #FF6B62;
          text-decoration: none;
          font-weight: 600;
        }
        a:hover {
          text-decoration: underline;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>ClipClass Privacy Policy</h1>
        <div class="date">Last Updated: June 2, 2026</div>
        
        <p>At ClipClass, we take your data privacy and security seriously. This Privacy Policy details how we collect, process, and handle user information for the ClipClass Chrome extension.</p>
        
        <h2>1. Information We Collect</h2>
        <p>ClipClass collects and processes the following information strictly to provide and maintain our service:</p>
        <ul>
          <li><strong>Authentication Information:</strong> Your email address and unique user ID (UID) are processed securely via Google Firebase Authentication when you register or sign in.</li>
          <li><strong>Usage Activity:</strong> We track the count of educational worksheets generated and translations requested. This is used solely to enforce free-tier limits and manage subscription access levels.</li>
        </ul>
        
        <h2>2. How Data is Used</h2>
        <p>We use the collected data exclusively to:</p>
        <ul>
          <li>Authenticate your user session and securely load your workspace.</li>
          <li>Track and enforce your weekly worksheet generation limits.</li>
          <li>Deliver compiled PDF workbooks to your device.</li>
        </ul>
        
        <h2>3. Data Sharing & Security</h2>
        <ul>
          <li>We do not sell, rent, trade, or share your personal data with any third parties.</li>
          <li>All communication between the extension, Firebase, and our servers is encrypted in transit via SSL/HTTPS.</li>
        </ul>
        
        <h2>4. Your Rights</h2>
        <p>You can request the deletion of your account and associated usage logs at any time by contacting us.</p>
        
        <h2>5. Contact Us</h2>
        <p>For support or privacy inquiries, please contact us at: <a href="mailto:mismail17.308@gmail.com">mismail17.308@gmail.com</a></p>
      </div>
      <footer>
        &copy; 2026 ClipClass. All rights reserved.
      </footer>
    </body>
    </html>
  `;
  res.send(html);
});

// ==========================================
// USER STATUS & QUOTA ENDPOINT
// ==========================================
app.get('/api/user-status', authenticateUser, async (req, res) => {
  const { uid, email } = req.user;

  try {
    // Path A: Firestore Database Check
    if (isFirebaseInitialized) {
      const userRef = db.collection('users').doc(uid);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        // Create initial Free Tier User Document in Firestore
        const newUserDoc = {
          uid: uid,
          email: email || "",
          plan: "free",
          usageCount: 0,
          translationUsageCount: 0,
          lastReset: admin.firestore.FieldValue.serverTimestamp() // Firestore Server Timestamp
        };
        await userRef.set(newUserDoc);
        
        return res.status(200).json({
          email: email,
          plan: "free",
          usageCount: 0,
          translationUsageCount: 0,
          limit: 10,
          remaining: 10
        });
      }

      const userData = userDoc.data();
      
      // Weekly Quota Reset Check
      let lastResetTime = userData.lastReset ? userData.lastReset.toDate().getTime() : Date.now();
      const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
      let usage = userData.usageCount || 0;

      if (Date.now() - lastResetTime > oneWeekMs) {
        usage = 0;
        await userRef.update({
          usageCount: 0,
          lastReset: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      return res.status(200).json({
        email: userData.email || email,
        plan: userData.plan || "free",
        usageCount: usage,
        translationUsageCount: userData.translationUsageCount || 0,
        limit: 10,
        remaining: Math.max(0, 10 - usage)
      });
    }

    // Path B: Local In-Memory Database Check
    const userDoc = getMockUserRecord(uid, email);
    res.status(200).json({
      email: userDoc.email,
      plan: userDoc.plan,
      usageCount: userDoc.usageCount,
      translationUsageCount: userDoc.translationUsageCount || 0,
      limit: 10,
      remaining: Math.max(0, 10 - userDoc.usageCount)
    });

  } catch (err) {
    console.error("Failed to query user status:", err);
    res.status(500).json({ error: `User status error: ${err.message}` });
  }
});

// ==========================================
// CREATE STRIPE CHECKOUT SESSION (Authenticated)
// ==========================================
app.post('/api/create-checkout-session', authenticateUser, async (req, res) => {
  const { uid, email } = req.user;

  // Path A: Production Stripe checkout redirect
  if (stripe) {
    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'gbp',
            product_data: {
              name: 'ClipClass Lifetime PRO',
              description: 'Lifetime unlimited educational worksheets, bilingual ELL translations, and gamified trivia review scripts for early adopters.',
            },
            unit_amount: 500, // £5.00 GBP (One-time payment)
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: 'https://youtube.com', // Safe placeholder that redirects back to YouTube watch page
        cancel_url: 'https://youtube.com',
        metadata: { uid: uid },
        customer_email: email || undefined,
      });

      return res.status(200).json({ checkoutUrl: session.url });
    } catch (err) {
      console.error("Stripe Session Creation failed:", err);
      return res.status(500).json({ error: `Stripe Checkout Session error: ${err.message}` });
    }
  }

  // Path B: Zero-Friction Developer Sandbox Fallback
  // Returns a gorgeous checkout simulation running on this exact local server!
  console.log(`[Stripe Dev Mode] Generating mock checkout session for user ${uid}...`);
  return res.status(200).json({ 
    checkoutUrl: `http://localhost:${PORT}/api/mock-checkout?uid=${uid}` 
  });
});

// ==========================================
// MOCK DEVELOPER CHECKOUT PAGE
// ==========================================
app.get('/api/mock-checkout', (req, res) => {
  const { uid } = req.query;

  if (!uid) {
    return res.status(400).send("Missing uid query parameter.");
  }

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>ClipClass Secure Mock Checkout</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
      <style>
        :root {
          --bg-color: #12141C;
          --panel-bg: #1A1D29;
          --border-color: #2A2D3E;
          --primary-accent: #8B5CF6;
          --primary-accent-hover: #7C3AED;
          --text-main: #FFFFFF;
          --text-secondary: #94A3B8;
        }
        body {
          margin: 0;
          background-color: var(--bg-color);
          color: var(--text-main);
          font-family: 'Inter', sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
        }
        .checkout-container {
          background-color: var(--panel-bg);
          border: 1px solid var(--border-color);
          padding: 40px;
          border-radius: 12px;
          width: 100%;
          max-width: 420px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
          text-align: center;
        }
        .logo-icon {
          width: 48px;
          height: 48px;
          background-color: rgba(139, 92, 246, 0.15);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
        }
        .logo-icon svg {
          width: 24px;
          height: 24px;
          fill: var(--primary-accent);
        }
        h1 {
          font-size: 1.5rem;
          font-weight: 800;
          letter-spacing: -0.5px;
          margin: 0 0 10px;
        }
        p.subtitle {
          color: var(--text-secondary);
          font-size: 0.88rem;
          line-height: 1.5;
          margin: 0 0 28px;
        }
        .summary-card {
          background-color: #12141C;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 28px;
          text-align: left;
        }
        .summary-row {
          display: flex;
          justify-content: space-between;
          font-size: 0.85rem;
          margin-bottom: 12px;
        }
        .summary-row:last-child {
          margin-bottom: 0;
          padding-top: 12px;
          border-top: 1px solid var(--border-color);
          font-weight: 700;
          font-size: 0.95rem;
        }
        .summary-label { color: var(--text-secondary); }
        .pay-btn {
          width: 100%;
          background: linear-gradient(135deg, #6366F1, #8B5CF6);
          color: #FFFFFF;
          border: none;
          font-family: inherit;
          font-size: 0.95rem;
          font-weight: 700;
          padding: 14px;
          border-radius: 8px;
          cursor: pointer;
          transition: transform 0.1s ease, box-shadow 0.2s ease;
        }
        .pay-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
        }
        .pay-btn:active {
          transform: translateY(0);
        }
        .status-message {
          margin-top: 20px;
          font-size: 0.85rem;
          font-weight: 600;
        }
        .status-message.success { color: #4ade80; }
        .status-message.error { color: #f87171; }
        .spinner {
          width: 20px;
          height: 20px;
          border: 2px solid rgba(255, 255, 255, 0.1);
          border-top-color: var(--text-main);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          display: inline-block;
          vertical-align: middle;
          margin-right: 8px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .hidden { display: none !important; }
      </style>
    </head>
    <body>
      <div class="checkout-container">
        <div class="logo-icon">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 5V19L19 12L8 5Z"/>
          </svg>
        </div>
        <h1>ClipClass Stripe Simulator</h1>
        <p class="subtitle">Complete your simulated purchase to activate your Premium PRO plan instantly.</p>
        
        <div class="summary-card">
          <div class="summary-row">
            <span class="summary-label">Subscription Plan</span>
            <span>ClipClass Lifetime PRO (Early Adopters)</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Customer UID</span>
            <span style="font-family: monospace; font-size: 0.78rem;">\${uid.substring(0, 16)}...</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Total Due</span>
            <span style="color: #4ade80;">£5.00 (One-time)</span>
          </div>
        </div>

        <button class="pay-btn" id="pay-btn">Pay £5.00 & Upgrade</button>
        <div class="status-message hidden" id="status"></div>
      </div>

      <script>
        const payBtn = document.getElementById("pay-btn");
        const statusEl = document.getElementById("status");

        payBtn.addEventListener("click", async () => {
          payBtn.disabled = true;
          payBtn.innerHTML = '<div class="spinner"></div>Authorizing Payment...';

          try {
            const res = await fetch("/api/mock-checkout-success", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ uid: "\${uid}" })
            });

            if (!res.ok) throw new Error("Payment gateway failure.");

            statusEl.textContent = "✅ Payment Successful! Redirecting to dashboard...";
            statusEl.className = "status-message success";
            payBtn.innerHTML = "Success!";
            
            setTimeout(() => {
              window.close(); // Closes checkout tab
            }, 2000);

          } catch (err) {
            statusEl.textContent = "❌ " + err.message;
            statusEl.className = "status-message error";
            payBtn.disabled = false;
            payBtn.innerHTML = "Pay £5.00 & Upgrade";
          }
        });
      </script>
    </body>
    </html>
  `;

  res.send(html);
});

// Helper to generate a detailed topic transcript when YouTube captions are unavailable
async function generateFallbackTranscript(videoTitle) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your-gemini-api-key-here' || apiKey === '') {
    throw new Error("Gemini API key is not configured.");
  }
  
  const systemPrompt = `You are an expert pedagogical curriculum developer. Your task is to analyze the provided educational video title and generate a chronological, content-rich 5-paragraph summary of the topic.
Each paragraph must detail a specific key concept, fact, or definition that would naturally be taught in a video with this title.
Do NOT write about the video itself (e.g. do not say "In this video, the speaker discusses..." or "The video explains..."). Write the direct, factual, educational content/facts as if it were a clean, factual transcript script.
Output a single, valid JSON object containing exactly 5 segments:
{
  "segments": [
    "Paragraph 1 text (Introduction and context)...",
    "Paragraph 2 text (First main concept)...",
    "Paragraph 3 text (Second main concept)...",
    "Paragraph 4 text (Detailed examples or applications)...",
    "Paragraph 5 text (Summary & takeaways)..."
  ]
}
Return ONLY raw JSON. Do not include markdown code block formatting (\`\`\`json) in your actual payload.`;

  const userPrompt = `Video Title: "${videoTitle}"`;
  
  const candidateModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-3.5-flash"];
  let lastError = null;

  for (const modelName of candidateModels) {
    try {
      console.log(`[Transcript Fallback] Attempting topic generation using model: ${modelName}...`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${systemPrompt}\n\n${userPrompt}`
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.35
          }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Model ${modelName} responded with status ${response.status}: ${errText}`);
      }

      const result = await response.json();
      const contentText = result.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!contentText) {
        throw new Error(`Model ${modelName} did not return content text.`);
      }

      const payload = JSON.parse(contentText.trim());
      console.log(`[Transcript Fallback] Successfully generated topic segments using model: ${modelName}`);
      return payload.segments || [];

    } catch (err) {
      console.warn(`[Transcript Fallback] Model ${modelName} failed: ${err.message}. Retrying next candidate...`);
      lastError = err;
    }
  }

  throw new Error(`Fallback transcript generation failed: ${lastError.message}`);
}

// ==========================================
// MOCK CHECKOUT SUCCESS HANDLER
// ==========================================
app.post('/api/mock-checkout-success', async (req, res) => {
  const { uid } = req.body;

  if (!uid) {
    return res.status(400).json({ error: "Missing required field: uid" });
  }

  try {
    console.log(`[Stripe Dev Mode] Upgrading user \${uid} to PRO via mock webhook...`);
    if (isFirebaseInitialized) {
      await db.collection('users').doc(uid).update({ plan: 'pro' });
    } else {
      const userDoc = getMockUserRecord(uid);
      userDoc.plan = 'pro';
    }
    console.log(`[Stripe Dev Mode] Successfully upgraded user \${uid} to PRO plan!`);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Mock upgrade failed:", err);
    return res.status(500).json({ error: `Mock upgrade error: \${err.message}` });
  }
});

// ==========================================
// CORE GENERATION ENDPOINT (Authenticated & Quota Checked)
// ==========================================
app.post('/api/generate-kit', authenticateUser, async (req, res) => {
  const { uid, email } = req.user;
  const { videoId, videoTitle, channelName, ageGroup, translationLanguage, gamifiedTrivia, questionsCount, showTimestamps } = req.body;

  // 1. Inputs Validations
  if (!videoId) {
    return res.status(400).json({ error: "Missing required field: videoId" });
  }

  const validAgeGroups = ["5-7", "8-10", "11-13", "14-16", "17+"];
  if (!ageGroup || !validAgeGroups.includes(ageGroup)) {
    return res.status(400).json({ 
      error: `Invalid or missing ageGroup. Must be one of: ${validAgeGroups.join(', ')}` 
    });
  }

  try {
    // 2. ENFORCE QUOTA TRACKING
    let plan = "free";
    let usageCount = 0;
    let translationUsageCount = 0;
    let userRef = null;
    let localUserDoc = null;

    if (isFirebaseInitialized) {
      userRef = db.collection('users').doc(uid);
      const userDoc = await userRef.get();
      
      let userData;
      if (!userDoc.exists) {
        // Create initial Free Tier User
        userData = {
          uid: uid,
          email: email || "",
          plan: "free",
          usageCount: 0,
          translationUsageCount: 0,
          lastReset: admin.firestore.FieldValue.serverTimestamp()
        };
        await userRef.set(userData);
      } else {
        userData = userDoc.data();
      }

      plan = userData.plan || "free";
      usageCount = userData.usageCount || 0;
      translationUsageCount = userData.translationUsageCount || 0;

      // Reset week interval in Firestore if expired
      let lastResetTime = userData.lastReset ? userData.lastReset.toDate().getTime() : Date.now();
      const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - lastResetTime > oneWeekMs) {
        usageCount = 0;
        await userRef.update({
          usageCount: 0,
          lastReset: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    } else {
      // Memory Fallback
      localUserDoc = getMockUserRecord(uid, email);
      plan = localUserDoc.plan;
      usageCount = localUserDoc.usageCount;
      translationUsageCount = localUserDoc.translationUsageCount || 0;
    }

    // 3. Quota check
    if (plan === "free" && usageCount >= 10) {
      return res.status(403).json({ 
        error: "Quota reached! You have completed your 10 free weekly generations. Upgrade to PRO for unlimited worksheets!" 
      });
    }

    const hasTranslation = translationLanguage && translationLanguage !== "None";
    if (plan === "free" && hasTranslation && translationUsageCount >= 1) {
      return res.status(403).json({ 
        error: "ELL Translation is a premium feature. Free tier users are limited to exactly 1 translation workbook. Upgrade to PRO to translate unlimited kits!" 
      });
    }

    // Enforce PRO-only limitations
    let finalQuestionsCount = 10;
    let finalShowTimestamps = false;

    if (plan === "pro") {
      if (typeof questionsCount === 'number' && [5, 10, 15, 20].includes(questionsCount)) {
        finalQuestionsCount = questionsCount;
      }
      if (typeof showTimestamps === 'boolean') {
        finalShowTimestamps = showTimestamps;
      }
    }

    console.log(`[Quota Checked] Generating kit for user ${uid} (${plan} plan). Questions: ${finalQuestionsCount}, Timestamps: ${finalShowTimestamps}. Current Usage: ${usageCount}/10`);

    // 4. Fetch Subtitles/Transcripts
    console.log(`Step 1: Extracting transcript for Video ${videoId}...`);
    let transcriptData;
    try {
      transcriptData = await fetchYouTubeTranscript(videoId);
    } catch (transcriptErr) {
      console.warn(`Transcript fetching failed for ID ${videoId}, calling AI fallback generator:`, transcriptErr.message);
      let segments = [];
      try {
        segments = await generateFallbackTranscript(videoTitle || "Educational Lesson");
      } catch (fallbackErr) {
        console.error("AI Fallback Transcript Generator failed:", fallbackErr.message);
      }

      if (segments && segments.length >= 5) {
        transcriptData = {
          fullText: segments.join(" "),
          timedSegments: [
            { time: "00:05", text: segments[0] },
            { time: "02:15", text: segments[1] },
            { time: "04:30", text: segments[2] },
            { time: "07:00", text: segments[3] },
            { time: "09:15", text: segments[4] }
          ]
        };
      } else {
        const titleClean = videoTitle || "Educational Lesson";
        transcriptData = {
          fullText: `An educational lesson about ${titleClean}. This lesson explores the key elements, core applications, detailed examples, and important takeaways regarding ${titleClean}.`,
          timedSegments: [
            { time: "00:05", text: `Introduction to ${titleClean} and why it is important.` },
            { time: "02:15", text: `Factual overview of the main components of ${titleClean}.` },
            { time: "04:30", text: `Explanation of the key mechanics, properties, or concepts of ${titleClean}.` },
            { time: "07:00", text: `Real-world examples, historical context, or case studies of ${titleClean}.` },
            { time: "09:15", text: `Summary of major points, conclusions, and applications of ${titleClean}.` }
          ]
        };
      }
    }

    // 5. AI Synthesis Layer
    console.log(`Step 2: Synthesizing dynamic curriculum prompts using Gemini...`);
    let aiContent;
    try {
      aiContent = await generateWorksheetContent({
        timedSegments: transcriptData.timedSegments,
        ageGroup: ageGroup,
        translationLanguage: translationLanguage || "None",
        gamifiedTrivia: !!gamifiedTrivia,
        questionsCount: finalQuestionsCount
      });
    } catch (aiErr) {
      console.error("AI Generation Layer failed:", aiErr);
      return res.status(502).json({ 
        error: `AI Content Synthesis failed: "${aiErr.message}". Verify your API Key configuration.` 
      });
    }

    // 6. Compile Printable PDF Assets
    console.log("Step 3: Compiling structured materials into professional PDF...");
    let pdfBuffer;
    try {
      const meta = {
        videoId: videoId,
        videoTitle: videoTitle || "YouTube Educational Lesson",
        channelName: channelName || "Educational Creator",
        ageGroup: ageGroup,
        translationLanguage: translationLanguage || "None",
        gamifiedTrivia: !!gamifiedTrivia,
        showTimestamps: finalShowTimestamps
      };

      pdfBuffer = await compileWorkbookPDF(aiContent, meta);
    } catch (pdfErr) {
      console.error("PDF Compilation Engine failed:", pdfErr);
      return res.status(500).json({ error: `PDF Compiler Error: ${pdfErr.message}` });
    }

    // 7. INCREMENT USAGE IN DATABASE ONCE GENERATED
    if (plan === "free") {
      const newUsage = usageCount + 1;
      const newTranslationUsage = hasTranslation ? translationUsageCount + 1 : translationUsageCount;
      if (isFirebaseInitialized) {
        await userRef.update({
          usageCount: newUsage,
          translationUsageCount: newTranslationUsage
        });
        console.log(`[Firestore DB] Incremented usageCount for user ${uid}. New Usage: ${newUsage}, Translations: ${newTranslationUsage}`);
      } else {
        localUserDoc.usageCount = newUsage;
        localUserDoc.translationUsageCount = newTranslationUsage;
        console.log(`[Mock DB] Incremented usageCount for user ${uid}. New Usage: ${newUsage}, Translations: ${newTranslationUsage}`);
      }
    }

    // 8. Stream PDF Binary response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ClipClass_${videoId}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);

  } catch (globalErr) {
    console.error("Global Endpoint failure:", globalErr);
    res.status(500).json({ error: `Internal Server Error: ${globalErr.message}` });
  }
});

// Helper to convert questions JSON to Blooket-compatible CSV
function convertToCSV(questions) {
  const headers = ["Question", "Answer 1", "Answer 2", "Answer 3", "Answer 4", "Correct Answer", "Time Limit"];
  const escapeField = (field) => {
    if (field === undefined || field === null) return '""';
    const str = String(field);
    return `"${str.replace(/"/g, '""')}"`;
  };
  
  const rows = [
    headers.map(escapeField).join(',')
  ];
  
  for (const q of questions) {
    const row = [
      q.question,
      q.options?.[0] || "",
      q.options?.[1] || "",
      q.options?.[2] || "",
      q.options?.[3] || "",
      q.correctAnswer || "",
      q.timeLimit || 20
    ];
    rows.push(row.map(escapeField).join(','));
  }
  
  return rows.join('\r\n');
}

// Blooket CSV Generator Endpoint (1 per day for Free, unlimited for PRO)
app.post('/api/generate-blooket', authenticateUser, async (req, res) => {
  const { uid, email } = req.user;
  const { videoId, videoTitle, channelName, ageGroup } = req.body;

  // 1. Inputs Validations
  if (!videoId) {
    return res.status(400).json({ error: "Missing required field: videoId" });
  }

  const validAgeGroups = ["5-7", "8-10", "11-13", "14-16", "17+"];
  if (!ageGroup || !validAgeGroups.includes(ageGroup)) {
    return res.status(400).json({ 
      error: `Invalid or missing ageGroup. Must be one of: ${validAgeGroups.join(', ')}` 
    });
  }

  try {
    // 2. ENFORCE QUOTA TRACKING
    let plan = "free";
    let lastBlooketReset = null;
    let userRef = null;
    let localUserDoc = null;

    if (isFirebaseInitialized) {
      userRef = db.collection('users').doc(uid);
      const userDoc = await userRef.get();
      
      let userData;
      if (!userDoc.exists) {
        userData = {
          uid: uid,
          email: email || "",
          plan: "free",
          usageCount: 0,
          translationUsageCount: 0,
          lastReset: admin.firestore.FieldValue.serverTimestamp(),
          lastBlooketReset: null
        };
        await userRef.set(userData);
      } else {
        userData = userDoc.data();
      }

      plan = userData.plan || "free";
      lastBlooketReset = userData.lastBlooketReset ? userData.lastBlooketReset.toDate().getTime() : null;
    } else {
      localUserDoc = getMockUserRecord(uid, email);
      plan = localUserDoc.plan;
      lastBlooketReset = localUserDoc.lastBlooketReset || null;
    }

    // 3. Quota check: Free tier users are limited to exactly 1 Blooket creation per 24 hours.
    const oneDayMs = 24 * 60 * 60 * 1000;
    if (plan === "free" && lastBlooketReset) {
      const timeSinceLastReset = Date.now() - lastBlooketReset;
      if (timeSinceLastReset < oneDayMs) {
        const remainingMs = oneDayMs - timeSinceLastReset;
        const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
        return res.status(403).json({ 
          error: `Blooket quota limit reached! Free tier users are limited to 1 Blooket creation per 24 hours. Please wait ${remainingHours} hour(s) or upgrade to PRO for unlimited Blooket creation!` 
        });
      }
    }

    console.log(`[Blooket Quota Checked] Generating Blooket game for user ${uid} (${plan} plan).`);

    // 4. Fetch Subtitles/Transcripts
    let transcriptData;
    try {
      transcriptData = await fetchYouTubeTranscript(videoId);
    } catch (transcriptErr) {
      console.warn(`Transcript fetching failed for ID ${videoId}, calling AI fallback generator:`, transcriptErr.message);
      let segments = [];
      try {
        segments = await generateFallbackTranscript(videoTitle || "Educational Lesson");
      } catch (fallbackErr) {
        console.error("AI Fallback Transcript Generator failed:", fallbackErr.message);
      }

      if (segments && segments.length >= 5) {
        transcriptData = {
          fullText: segments.join(" "),
          timedSegments: [
            { time: "00:05", text: segments[0] },
            { time: "02:15", text: segments[1] },
            { time: "04:30", text: segments[2] },
            { time: "07:00", text: segments[3] },
            { time: "09:15", text: segments[4] }
          ]
        };
      } else {
        const titleClean = videoTitle || "Educational Lesson";
        transcriptData = {
          fullText: `An educational lesson about ${titleClean}. This lesson explores the key elements, core applications, detailed examples, and important takeaways regarding ${titleClean}.`,
          timedSegments: [
            { time: "00:05", text: `Introduction to ${titleClean} and why it is important.` },
            { time: "02:15", text: `Factual overview of the main components of ${titleClean}.` },
            { time: "04:30", text: `Explanation of the key mechanics, properties, or concepts of ${titleClean}.` },
            { time: "07:00", text: `Real-world examples, historical context, or case studies of ${titleClean}.` },
            { time: "09:15", text: `Summary of major points, conclusions, and applications of ${titleClean}.` }
          ]
        };
      }
    }

    // 5. AI Synthesis Layer
    let blooketJSON;
    try {
      blooketJSON = await generateBlooketContent({
        timedSegments: transcriptData.timedSegments,
        ageGroup: ageGroup
      });
    } catch (aiErr) {
      console.error("AI Blooket Generation failed:", aiErr);
      return res.status(502).json({ 
        error: `AI Content Synthesis failed: "${aiErr.message}". Verify your API Key configuration.` 
      });
    }

    if (!blooketJSON || !blooketJSON.questions || !Array.isArray(blooketJSON.questions)) {
      return res.status(500).json({ error: "Invalid AI response structure. Questions array was not generated." });
    }

    // 6. Convert JSON to CSV
    const csvContent = convertToCSV(blooketJSON.questions);

    // 7. Update lastBlooketReset in Database
    if (isFirebaseInitialized) {
      await userRef.update({
        lastBlooketReset: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`[Firestore DB] Updated lastBlooketReset for user ${uid}.`);
    } else {
      localUserDoc.lastBlooketReset = Date.now();
      console.log(`[Mock DB] Updated lastBlooketReset for user ${uid}.`);
    }

    // 8. Stream CSV response
    const safeTitle = (videoTitle || "Blooket_Set").replace(/[^a-z0-9]/gi, '_').toLowerCase();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="ClipClass_Blooket_${safeTitle}.csv"`);
    res.send(csvContent);

  } catch (globalErr) {
    console.error("Global Blooket Endpoint failure:", globalErr);
    res.status(500).json({ error: `Internal Server Error: ${globalErr.message}` });
  }
});


// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Unhandled middleware exception:", err);
  res.status(500).json({ error: "An unexpected error occurred on the ClipClass backend." });
});

app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🚀 ClipClass Authenticated Server running on Port ${PORT}`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`🔒 Authentication: Firebase Auth + Firestore Limits`);
  console.log(`==================================================`);
});
