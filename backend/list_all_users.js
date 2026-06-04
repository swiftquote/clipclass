import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const serviceAccountPath = path.resolve('firebase-service-account.json');

if (!fs.existsSync(serviceAccountPath)) {
  print("firebase-service-account.json is missing!");
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function listAllUsers() {
  console.log("Fetching all user documents from Firestore...");
  const snapshot = await db.collection('users').get();
  
  if (snapshot.empty) {
    console.log("No users found in database.");
    process.exit(0);
  }
  
  console.log(`\nFound ${snapshot.size} user(s) in total:`);
  console.log("==================================================");
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`- Email: ${data.email || 'N/A'}`);
    console.log(`  UID:   ${doc.id}`);
    console.log(`  Plan:  ${data.plan || 'free'}`);
    console.log(`  Usage: ${data.usageCount || 0}`);
    console.log("--------------------------------------------------");
  });
  
  process.exit(0);
}

listAllUsers().catch(err => {
  console.error("Error listing users:", err);
  process.exit(1);
});
