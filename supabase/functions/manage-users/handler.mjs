const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export function createHandler(createClient, environment) {
  return async request => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (request.method !== 'POST') return reply(405, { error: 'Use POST.' });
    const token = request.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return reply(401, { error: 'Please sign in.' });
    if (!environment.url || !environment.serviceRoleKey) return reply(503, { error: 'Account administration is not configured.' });
    try {
      // Never forward the caller's Authorization header into this privileged client.
      const admin = createClient(environment.url, environment.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: session, error: authError } = await admin.auth.getUser(token);
      if (authError || !session?.user) return reply(401, { error: 'Your session has expired. Sign in again.' });
      const uid = session.user.id;
      const { data: caller, error: callerError } = await admin.from('profiles').select('role, active').eq('id', uid).maybeSingle();
      if (callerError) return reply(503, { error: 'Unable to verify administrator access.' });
      if (!caller || caller.role !== 'DEO' || caller.active !== true) return reply(403, { error: 'Only an active DEO administrator can manage accounts.' });
      let data;
      try { data = await request.json(); } catch { return reply(400, { error: 'Send a valid JSON request.' }); }
      if (!data || typeof data !== 'object' || Array.isArray(data)) return reply(400, { error: 'Send an account request.' });

      if (data.action === 'set-status') {
        if (typeof data.uid !== 'string' || typeof data.active !== 'boolean' || data.uid === uid) return reply(400, { error: 'Choose another staff account and a valid status.' });
        const { data: target, error: targetError } = await admin.from('profiles').select('role').eq('id', data.uid).maybeSingle();
        if (targetError) return reply(400, { error: 'Invalid staff account.' });
        if (!target) return reply(404, { error: 'Staff account not found.' });
        if (!['MEO', 'PD', 'PET'].includes(target.role)) return reply(403, { error: 'Administrator accounts cannot be changed here.' });
        const { error } = await admin.from('profiles').update({ active: data.active, updatedAt: new Date().toISOString() }).eq('id', data.uid);
        return error ? reply(500, { error: 'Unable to update staff access.' }) : reply(200, { uid: data.uid, active: data.active });
      }
      if (data.action !== 'create') return reply(400, { error: 'Unknown account action.' });
      const email = String(data.email || '').trim().toLowerCase();
      const password = typeof data.password === 'string' ? data.password : '';
      const displayName = String(data.displayName || '').trim();
      const role = String(data.role || '').trim().toUpperCase();
      const mandal = String(data.mandal || '').trim().toUpperCase();
      const schoolUdise = String(data.schoolUdise || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return reply(400, { error: 'Enter a valid email.' });
      if (password.length < 8 || password.length > 128) return reply(400, { error: 'Passwords must have 8–128 characters.' });
      if (!displayName || displayName.length > 100) return reply(400, { error: 'Names must have 1–100 characters.' });
      if (!['MEO', 'PD', 'PET'].includes(role)) return reply(400, { error: 'Allowed staff roles: MEO, PD and PET.' });
      let schoolQuery = admin.from('schools').select('*');
      schoolQuery = role === 'MEO' ? schoolQuery.eq('mandal', mandal).limit(1) : schoolQuery.eq('udise', schoolUdise);
      const { data: school, error: schoolError } = await schoolQuery.maybeSingle();
      if (schoolError || !school || school.mandal !== mandal) return reply(400, { error: 'Choose a valid mandal and school assignment.' });

      const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { displayName } });
      if (createError || !created?.user) {
        const duplicate = ['email_exists', 'user_already_exists'].includes(createError?.code);
        return reply(duplicate ? 409 : 400, { error: duplicate ? 'This email is already registered. Its password was not changed.' : 'Unable to create this login. Check the password policy and Auth service limits before retrying.' });
      }
      const { error: profileError } = await admin.from('profiles').insert({
        id: created.user.id, email, name: displayName, displayName, role, mandal,
        mandalCode: school.mandalCode || '',
        schoolUdise: role === 'MEO' ? 'ALL' : school.udise,
        schoolName: role === 'MEO' ? 'All schools in assigned mandal' : school.name,
        active: true, createdBy: uid
      });
      if (profileError) {
        const { error: cleanupError } = await admin.auth.admin.deleteUser(created.user.id);
        return reply(500, { error: cleanupError
          ? 'Staff profile creation failed and the Auth identity could not be removed. Ask the project owner to inspect this email in Authentication before retrying.'
          : 'Staff profile creation failed. The new Auth identity was removed; no login was retained.' });
      }
      return reply(200, { uid: created.user.id, email, role });
    } catch {
      // Never log request bodies, passwords, Auth errors or service credentials.
      return reply(500, { error: 'Account request failed. Check this email in Supabase Authentication before retrying creation.' });
    }
  };
}
