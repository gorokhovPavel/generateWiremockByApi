#!/usr/bin/env node
import readline from 'readline';
import fs from 'fs';
import { execSync } from 'child_process';

const CHANGELOG_PATH = 'CHANGELOG.md';

const CATEGORIES = [
  'Добавлено',
  'Изменено',
  'Исправлено',
  'Удалено',
  'Общее',
];

const BUMP_OPTIONS = [
  { label: 'patch',         type: 'patch' },
  { label: 'minor',         type: 'minor' },
  { label: 'major',         type: 'major' },
  { label: 'не обновляем', type: null    },
];

// --- helpers ---

const ask = (rl, question) =>
  new Promise((resolve) => rl.question(question, (a) => resolve(a.trim())));

function currentVersion() {
  const content = fs.readFileSync(CHANGELOG_PATH, 'utf8');
  const match = content.match(/## \[(\d+\.\d+\.\d+)\]/);
  return match ? match[1] : '0.0.0';
}

function bumpVersion(version, type) {
  const [major, minor, patch] = version.split('.').map(Number);
  if (type === 'major') return `${major + 1}.0.0`;
  if (type === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function todayDate() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function recentCommits() {
  try {
    const lastChangelogCommit = execSync(
      'git log --oneline -- CHANGELOG.md',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim().split('\n')[0] ?? '';

    const flag = lastChangelogCommit
      ? `${lastChangelogCommit.split(' ')[0]}..HEAD`
      : '-10';

    const log = execSync(
      `git log --oneline ${flag} -- . ":(exclude)CHANGELOG.md"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();

    return log || '(нет коммитов)';
  } catch {
    return '(нет коммитов)';
  }
}

function prependToChangelog(version, category, body) {
  const content = fs.readFileSync(CHANGELOG_PATH, 'utf8');
  const entry = [
    `## [${version}] - ${todayDate()}`,
    ``,
    `### ${category}`,
    body,
    ``,
    ``,
  ].join('\n');

  const firstEntry = content.indexOf('## [');
  const updated =
    firstEntry === -1
      ? content.trimEnd() + '\n\n' + entry
      : content.slice(0, firstEntry) + entry + content.slice(firstEntry);

  fs.writeFileSync(CHANGELOG_PATH, updated, 'utf8');
}

// --- main ---

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\n─────────────────────────────────');
  console.log('  📋 Обновление CHANGELOG');
  console.log('─────────────────────────────────');
  console.log('\nПоследние коммиты:\n');
  console.log(recentCommits().split('\n').map((l) => '  ' + l).join('\n'));
  console.log('');

  const proceed = await ask(rl, 'Обновить CHANGELOG? (y/n): ');
  if (proceed.toLowerCase() !== 'y') {
    console.log('Пропущено.\n');
    rl.close();
    process.exit(0);
  }

  // bump type
  const ver = currentVersion();
  console.log(`\nТекущая версия: ${ver}`);
  console.log('Обновить версию:');
  BUMP_OPTIONS.forEach((o, i) => console.log(`  ${i + 1}) ${o.label}`));
  const bumpInput = await ask(rl, 'Выбор [1]: ');
  const bumpIndex = parseInt(bumpInput, 10) - 1;
  const selectedBump = BUMP_OPTIONS[bumpIndex] ?? BUMP_OPTIONS[0];
  const skipVersionBump = selectedBump.type === null;
  const newVersion = skipVersionBump ? ver : bumpVersion(ver, selectedBump.type);
  console.log(skipVersionBump ? `Версия остаётся: ${ver}` : `Новая версия: ${newVersion}`);

  // category
  console.log('\nКатегория:');
  CATEGORIES.forEach((c, i) => console.log(`  ${i + 1}) ${c}`));
  const catInput = await ask(rl, 'Выбор [1]: ');
  const catIndex = parseInt(catInput, 10) - 1;
  const category = CATEGORIES[catIndex] ?? CATEGORIES[0];

  // functional area
  const area = await ask(rl, '\nФункциональность (Enter — пропустить): ');
  const subArea = area ? await ask(rl, 'Подраздел (Enter — пропустить): ') : '';

  // description(s)
  const firstDesc = await ask(rl, 'Описание: ');
  if (!firstDesc) {
    console.log('Описание не введено, отмена.\n');
    rl.close();
    process.exit(1);
  }
  const descriptions = [firstDesc];

  while (true) {
    const extra = await ask(rl, 'Ещё одно описание? (Enter — пропустить): ');
    if (!extra) break;
    descriptions.push(extra);
  }

  const doCommit = await ask(rl, '\nСделать коммит сразу? (y/n) [y]: ');

  rl.close();

  const areaLine = area
    ? `функциональность "${area}"${subArea ? ` / "${subArea}"` : ''}`
    : null;

  const body = areaLine
    ? `- ${areaLine}\n${descriptions.map((d) => `    - ${d}`).join('\n')}`
    : descriptions.map((d) => `- ${d}`).join('\n');

  prependToChangelog(newVersion, category, body);

  if (!skipVersionBump) {
    execSync(`npm version ${newVersion} --no-git-tag-version`, {
      stdio: 'ignore',
      env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
    });
  }

  const changedFiles = skipVersionBump
    ? ['CHANGELOG.md']
    : ['CHANGELOG.md', 'package.json', 'package-lock.json'];

  if (doCommit.toLowerCase() !== 'n') {
    execSync(`git add ${changedFiles.join(' ')}`);
    execSync(`git commit -m "chore: update changelog [${newVersion}]"`);
    console.log(`\n✓ ${changedFiles.join(', ')} обновлены и закоммичены → версия ${newVersion}\n`);
  } else {
    console.log(`\n✓ ${changedFiles.join(', ')} обновлены → версия ${newVersion}`);
    console.log('  Изменения не закоммичены — добавьте их в свой коммит вручную.\n');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
