import { before, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-manyam', firestore: { rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') } });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'users/admin'), { role: 'DEO', active: true });
    await setDoc(doc(db, 'users/staff'), { role: 'PET', active: true, mandal: 'BHAMINI', schoolUdise: '123' });
    await setDoc(doc(db, 'schools/123'), { udise: '123', name: 'School', mandal: 'BHAMINI' });
    await setDoc(doc(db, 'students/student'), { name: 'Test', mandal: 'BHAMINI', schoolUdise: '123' });
  });
});
after(async () => { await env?.cleanup(); });
const data = () => ({ email: 'new@example.org', name: 'New Staff', displayName: 'New Staff', role: 'PET', mandal: 'BHAMINI', mandalCode: '', schoolUdise: '123', schoolName: 'School', active: true, createdBy: 'admin', createdAt: serverTimestamp() });
const adminDb = () => env.authenticatedContext('admin').firestore();

test('active DEO can create a valid staff profile', async () => {
  await assertSucceeds(setDoc(doc(adminDb(), 'users/new-staff'), data()));
  await assertSucceeds(setDoc(doc(adminDb(), 'users/new-meo'), { ...data(), role: 'MEO', schoolUdise: 'ALL' }));
});
test('anonymous, unprovisioned and staff sessions cannot provision profiles', async () => {
  for (const context of [env.unauthenticatedContext(), env.authenticatedContext('orphan'), env.authenticatedContext('staff')]) {
    await assertFails(setDoc(doc(context.firestore(), 'users/forbidden'), data()));
  }
});
test('rules prevent admin escalation, wrong school and plaintext password storage', async () => {
  const db = adminDb();
  for (const changes of [{ role: 'DEO' }, { schoolUdise: '456' }, { mandal: 'KOMARADA' }, { password: 'Secret123' }, { createdBy: 'other' }, { active: false }]) {
    await assertFails(setDoc(doc(db, 'users/invalid'), { ...data(), ...changes }));
  }
});
test('DEO can toggle staff access but cannot edit roles or admin status', async () => {
  const db = adminDb();
  await assertSucceeds(updateDoc(doc(db, 'users/new-staff'), { active: false, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'users/new-staff'), { role: 'DEO', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'users/admin'), { active: false, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(env.authenticatedContext('staff').firestore(), 'users/new-staff'), { active: true, updatedAt: serverTimestamp() }));
});
test('deactivated staff lose access even with an existing authenticated session', async () => {
  const db = env.authenticatedContext('staff').firestore();
  await assertSucceeds(getDoc(doc(db, 'students/student')));
  await assertSucceeds(updateDoc(doc(adminDb(), 'users/staff'), { active: false, updatedAt: serverTimestamp() }));
  await assertFails(getDoc(doc(db, 'students/student')));
  await assertFails(getDoc(doc(env.authenticatedContext('orphan').firestore(), 'students/student')));
});
