const fs = require('fs');

if (fs.existsSync('.env')) {
  let content = fs.readFileSync('.env', 'utf8');
  if (/^GEMINI_MODEL=/m.test(content)) {
    content = content.replace(/^GEMINI_MODEL=.*$/m, 'GEMINI_MODEL="gemini-2.5-flash"');
  } else {
    content += '\nGEMINI_MODEL="gemini-2.5-flash"\n';
  }
  fs.writeFileSync('.env', content, 'utf8');
  console.log('✅ .env mis à jour : GEMINI_MODEL="gemini-2.5-flash"');
}
