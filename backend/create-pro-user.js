import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const serviceAccountPath = path.resolve('firebase-service-account.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error("firebase-service-account.json is missing!");
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function run() {
  const email = "FAfzal@gulfenglishschool.com";
  const password = "ges123";

  console.log(`Checking if user ${email} exists in Firebase Auth...`);
  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(email);
    console.log(`User already exists with UID: ${userRecord.uid}. Updating password to ${password}...`);
    await admin.auth().updateUser(userRecord.uid, {
      password: password
    });
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      console.log(`User does not exist. Creating new user...`);
      userRecord = await admin.auth().createUser({
        email: email,
        password: password,
        emailVerified: true
      });
      console.log(`Successfully created user with UID: ${userRecord.uid}`);
    } else {
      throw err;
    }
  }

  const uid = userRecord.uid;
  console.log(`Setting plan: "pro" in Firestore users/${uid}...`);

  const userRef = db.collection('users').doc(uid);
  const userDoc = await userRef.get();

  if (userDoc.exists) {
    await userRef.update({
      plan: "pro"
    });
    console.log(`Updated existing user's plan to pro.`);
  } else {
    const newUserDoc = {
      uid: uid,
      email: email,
      plan: "pro",
      usageCount: 0,
      translationUsageCount: 0,
      lastReset: admin.firestore.FieldValue.serverTimestamp()
    };
    await userRef.set(newUserDoc);
    console.log(`Created new Firestore user document with plan: pro.`);
  }

  console.log("SUCCESS!");
  process.exit(0);
}

run().catch(err => {
  console.error("FAILED:", err);
  process.exit(1);
});
