// Persistence driver factory.
// Selected by PERSISTENCE_DRIVER env var: "json" (default) or "supabase".
// Both drivers expose the same interface: loadReminders() and saveReminders(reminders).
// loadReminders may return a Promise (supabase) or a plain value (json) — always await it.

const driver = (process.env.PERSISTENCE_DRIVER || 'json').toLowerCase();

if (driver === 'supabase') {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      '[Persistence] PERSISTENCE_DRIVER=supabase, ampak SUPABASE_URL ali ' +
      'SUPABASE_SERVICE_ROLE_KEY manjkata.\n' +
      '              Nastavi obe okoljski spremenljivki in znova zaženi strežnik.'
    );
    process.exit(1);
  }
  console.log('[Persistence] Driver: supabase');
  module.exports = require('./supabaseStore');
} else {
  console.log('[Persistence] Driver: json  →  data/reminders.json');
  module.exports = require('./jsonStore');
}
