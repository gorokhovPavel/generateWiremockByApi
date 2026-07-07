#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const hookPath = path.resolve('.git/hooks/pre-push');

// Git for Windows runs hooks via Git Bash — #!/bin/sh works as-is.
// chmod +x is not needed and not available on Windows.
const hookContent = `#!/bin/sh
node scripts/changelog.mjs
if [ $? -ne 0 ]; then
  exit 1
fi
`;

if (!fs.existsSync('.git')) {
  console.error('Ошибка: запустите скрипт из корня git-репозитория.');
  process.exit(1);
}

fs.mkdirSync('.git/hooks', { recursive: true });
fs.writeFileSync(hookPath, hookContent, { encoding: 'utf8', flag: 'w' });

console.log('✓ Git-хук pre-push установлен.');
console.log('  Скрипт будет запускаться автоматически перед каждым git push.');
console.log('  Требуется Git for Windows (git bash) — https://git-scm.com/download/win');
