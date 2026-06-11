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
  const email = process.argv[2];
  const plan = process.argv[3];

  if (!email || !plan) {
    console.error("Usage: node manage-user-plan.js <email> <plan>");
    process.exit(1);
  }

  console.log(`Searching for user document with email: ${email} in Firestore...`);
  const snapshot = await db.collection('users').where('email', '==', email).get();

  if (snapshot.empty) {
    console.error(`User doc for email ${email} not found!`);
    process.exit(1);
  }

  const userDoc = snapshot.docs[0];
  const userRef = userDoc.ref;

  console.log(`Setting plan: "${plan}" for user UID: ${userDoc.id}...`);
  await userRef.update({ plan: plan });
  console.log(`SUCCESS! Plan updated to ${plan}.`);
  process.exit(0);
}

run().catch(err => {
  console.error("FAILED:", err);
  process.exit(1);
});
