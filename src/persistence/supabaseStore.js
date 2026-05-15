const { createClient } = require('@supabase/supabase-js');

let _client = null;

function client() {
  if (!_client) {
    _client = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return _client;
}

// Return full reminder objects from the `data` jsonb column.
async function loadReminders() {
  const { data, error } = await client()
    .from('reminders')
    .select('data');
  if (error) throw new Error(`[Supabase] loadReminders: ${error.message}`);
  return (data || []).map(row => row.data);
}

// Full sync: upsert current reminders, then delete rows whose id is no longer present.
// This handles all deletion paths (the app deletes by saving a smaller array).
async function saveReminders(reminders) {
  const sb = client();

  if (reminders.length > 0) {
    const rows = reminders.map(r => ({
      id:         r.id,
      data:       r,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await sb.from('reminders').upsert(rows, { onConflict: 'id' });
    if (error) throw new Error(`[Supabase] upsert: ${error.message}`);
  }

  // Determine which rows to delete
  const { data: existing, error: fetchErr } = await sb.from('reminders').select('id');
  if (fetchErr) throw new Error(`[Supabase] fetch IDs: ${fetchErr.message}`);

  const current  = new Set(reminders.map(r => r.id));
  const toDelete = (existing || []).map(r => r.id).filter(id => !current.has(id));

  if (toDelete.length > 0) {
    const { error: delErr } = await sb.from('reminders').delete().in('id', toDelete);
    if (delErr) throw new Error(`[Supabase] delete: ${delErr.message}`);
  }
}

module.exports = { loadReminders, saveReminders };
