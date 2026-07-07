#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const hookPath = path.resolve('.git/hooks/pre-push');

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
fs.writeFileSync(hookPath, hookContent, 'utf8');
execSync(`chmod +x ${hookPath}`);

console.log('✓ Git-хук pre-push установлен.');
console.log('  Скрипт будет запускаться автоматически перед каждым git push.');
