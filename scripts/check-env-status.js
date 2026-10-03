const fs = require('fs');

if (!fs.existsSync('.env')) {
  console.log('Aucun fichier .env trouvé.');
  process.exit(0);
}

const env = fs.readFileSync('.env', 'utf8');
const lines = env.split(/\r?\n/);
const keys = {};

for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx > 0) {
    const k = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    keys[k] = val ? `DÉFINI (longueur: ${val.length})` : 'VIDE';
  }
}

const expected = [
  'DATABASE_URL',
  'KENE_SESSION_SECRET',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'WAVE_API_KEY',
  'WAVE_WEBHOOK_SECRET',
  'ORANGE_MONEY_CLIENT_ID',
  'ORANGE_MONEY_CLIENT_SECRET',
  'ORANGE_MONEY_MERCHANT_KEY',
  'WINIPAYER_MERCHANT_UUID',
  'AFRICASTALKING_API_KEY',
  'AFRICASTALKING_USERNAME',
  'ZAVU_API_KEY',
  'TERMII_API_KEY',
  'TERMII_SENDER_ID'
];

console.log('=== VÉRIFICATION DES VARIABLES .ENV ===');
for (const k of expected) {
  console.log(`${k}: ${keys[k] || 'NON PRÉSENT'}`);
}
