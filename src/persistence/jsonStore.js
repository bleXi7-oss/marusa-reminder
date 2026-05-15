const fs   = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'reminders.json');

function loadReminders() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      const backup = DATA_FILE + '.backup.' + Date.now();
      try { fs.copyFileSync(DATA_FILE, backup); } catch (_) {}
      console.log('[JSON] Podatki poškodovani — začenjam znova. Backup:', backup);
    }
    saveReminders([]);
    return [];
  }
}

function saveReminders(reminders) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(reminders, null, 2));
}

module.exports = { loadReminders, saveReminders };
