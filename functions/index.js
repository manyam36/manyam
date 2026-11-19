const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();
const REGION = "asia-south1";
const VALID_MANDALS = [
  "BALIJIPETA", "BHAMINI", "G.L.PURAM", "GARUGUBILLI",
  "JIYYAMMAVALASA", "KOMARADA", "KURUPAM", "MAKKUVA",
  "PACHIPENTA", "PALAKONDA", "PARVATHIPURAM", "SALURU",
  "SEETHAMPETA", "SEETHANAGARAM", "VEERAGHATTAM"
];

function assertSafeAdminEnvironment() {
  // `firebase serve` can emulate Functions while Auth/Firestore still point to production.
  // Refuse admin mutations in that mixed mode to prevent accidental production changes.
  if (process.env.FUNCTIONS_EMULATOR === "true" &&
      (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST)) {
    throw new HttpsError(
      "failed-precondition",
      "For local user administration, start the Auth, Firestore and Functions emulators together. This request was blocked to protect production data."
    );
  }
}

async function requireDEO(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Please sign in.");
  }
  const snap = await db.doc(`users/${request.auth.uid}`).get();
  if (!snap.exists || snap.data().active !== true || snap.data().role !== "DEO") {
    throw new HttpsError("permission-denied", "Only an active DEO administrator can perform this action.");
  }
  return snap.data();
}

exports.createManagedUser = onCall({ region: REGION }, async (request) => {
  assertSafeAdminEnvironment();
  await requireDEO(request);

  const data = request.data || {};
  const email = String(data.email || "").trim().toLowerCase();
  const password = String(data.password || "");
  const displayName = String(data.displayName || "").trim();
  const role = String(data.role || "").trim().toUpperCase();
  const mandal = String(data.mandal || "").trim().toUpperCase();
  const schoolUdise = String(data.schoolUdise || "").trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError("invalid-argument", "Enter a valid email address.");
  }
  if (password.length < 8) {
    throw new HttpsError("invalid-argument", "Password must contain at least 8 characters.");
  }
  if (!displayName) {
    throw new HttpsError("invalid-argument", "Full name is required.");
  }
  if (!["MEO", "PD", "PET"].includes(role)) {
    throw new HttpsError("invalid-argument", "Allowed roles are MEO, PD and PET.");
  }
  if (!VALID_MANDALS.includes(mandal)) {
    throw new HttpsError("invalid-argument", "Select a valid district mandal.");
  }

  let school = null;
  let mandalCode = "";
  if (role === "MEO") {
    const schoolSnap = await db.collection("schools").where("mandal", "==", mandal).limit(1).get();
    if (schoolSnap.empty) throw new HttpsError("failed-precondition", "No school master record found for this mandal.");
    mandalCode = String(schoolSnap.docs[0].data().mandalCode || "");
  } else {
    if (!schoolUdise) throw new HttpsError("invalid-argument", "Select the assigned school.");
    const schoolSnap = await db.collection("schools").doc(schoolUdise).get();
    if (!schoolSnap.exists) throw new HttpsError("not-found", "Selected UDISE code is not present in the school master.");
    school = schoolSnap.data();
    if (String(school.mandal).toUpperCase() !== mandal) {
      throw new HttpsError("invalid-argument", "Selected school does not belong to the selected mandal.");
    }
    mandalCode = String(school.mandalCode || "");
  }

  let createdUser;
  try {
    createdUser = await admin.auth().createUser({
      email,
      password,
      displayName,
      disabled: false
    });

    const profile = {
      email,
      name: displayName,
      displayName,
      role,
      mandal,
      mandalCode,
      active: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: request.auth.uid
    };
    if (school) {
      profile.schoolUdise = school.udise;
      profile.schoolName = school.name;
    } else {
      profile.schoolUdise = "ALL";
      profile.schoolName = "All schools in assigned mandal";
    }

    await db.doc(`users/${createdUser.uid}`).set(profile);
    return { uid: createdUser.uid, email, role, mandal, schoolUdise: profile.schoolUdise };
  } catch (error) {
    if (createdUser) {
      try { await admin.auth().deleteUser(createdUser.uid); } catch (_) {}
    }
    if (error.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "This email is already registered.");
    }
    if (error instanceof HttpsError) throw error;
    console.error("createManagedUser failed", error);
    throw new HttpsError("internal", "Unable to create the account. Check Functions logs.");
  }
});

exports.setManagedUserStatus = onCall({ region: REGION }, async (request) => {
  assertSafeAdminEnvironment();
  await requireDEO(request);
  const uid = String(request.data?.uid || "").trim();
  const active = request.data?.active;
  if (!uid || typeof active !== "boolean") {
    throw new HttpsError("invalid-argument", "A user UID and active true/false value are required.");
  }
  if (uid === request.auth.uid) {
    throw new HttpsError("failed-precondition", "You cannot deactivate your own DEO account.");
  }

  const userRef = db.doc(`users/${uid}`);
  const profileSnap = await userRef.get();
  if (!profileSnap.exists) throw new HttpsError("not-found", "User profile not found.");
  if (profileSnap.data().role === "DEO") {
    throw new HttpsError("permission-denied", "DEO administrator accounts cannot be changed here.");
  }

  try {
    await admin.auth().updateUser(uid, { disabled: !active });
    await userRef.update({
      active,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: request.auth.uid
    });
    return { uid, active };
  } catch (error) {
    console.error("setManagedUserStatus failed", error);
    throw new HttpsError("internal", "Unable to update account status.");
  }
});
