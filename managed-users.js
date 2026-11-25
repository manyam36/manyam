// Account administration runs in an authenticated Edge Function.
// The privileged service-role key stays on the Supabase server.
async function manage(client, body) {
  const { data, error } = await client.functions.invoke('manage-users', { body });
  if (error) {
    let message = 'Unable to manage this account. Check your connection and the manage-users Edge Function deployment.';
    if (error.context?.json) {
      try { message = (await error.context.json()).error || message; } catch {}
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function createManagedAccount(client, administrator, data) {
  if (!administrator) throw new Error('Please sign in as DEO administrator.');
  return manage(client, { action: 'create', ...data });
}

export async function setAccountActive(client, uid, active) {
  return manage(client, { action: 'set-status', uid, active });
}
