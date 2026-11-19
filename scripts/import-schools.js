
const admin = require("../functions/node_modules/firebase-admin");
const schools = require("../schools.json");

admin.initializeApp();

const db = admin.firestore();

async function importSchools() {
  if (schools.length !== 200) {
    throw new Error(`Expected 200 schools, found ${schools.length}`);
  }

  const seen = new Set();

  for (const school of schools) {
    const udise = String(school.udise).trim();

    if (!udise || seen.has(udise)) {
      throw new Error(`Invalid or duplicate UDISE: ${udise}`);
    }

    if (!school.name || !school.mandal || !school.mandalCode) {
      throw new Error(`Missing fields for UDISE: ${udise}`);
    }

    seen.add(udise);
  }

  // Import in batches of 400 or fewer.
  const batch = db.batch();

  for (const school of schools) {
    const udise = String(school.udise).trim();

    const ref = db.collection("schools").doc(udise);

    batch.set(ref, {
      udise,
      name: school.name.trim(),
      mandal: school.mandal.trim(),
      mandalCode: String(school.mandalCode).trim(),
      source: "Manyam District School Master"
    });
  }

  await batch.commit();

  console.log("SUCCESS: Imported 200 schools.");
  process.exit(0);
}

importSchools().catch((error) => {
  console.error("IMPORT FAILED:", error);
  process.exit(1);
});
