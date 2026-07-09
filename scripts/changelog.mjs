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

const askChoice = async (rl, question, count) => {
  while (true) {
    const input = await ask(rl, question);
    if (input === '') return 0;
    const index = parseInt(input, 10) - 1;
    if (!isNaN(index) && index >= 0 && index < count) return index;
    console.log(`  ✗ Некорректный ввод — введите число от 1 до ${count}`);
  }
};

const askYesNo = async (rl, question, defaultYes = true) => {
  while (true) {
    const input = await ask(rl, question);
    if (input === '') return defaultYes;
    if (input.toLowerCase() === 'y') return true;
    if (input.toLowerCase() === 'n') return false;
    console.log('  ✗ Некорректный ввод — введите y или n');
  }
};

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

  const proceed = await askYesNo(rl, 'Обновить CHANGELOG? (y/n): ', false);
  if (!proceed) {
    console.log('Пропущено.\n');
    rl.close();
    process.exit(0);
  }

  // bump type
  const ver = currentVersion();
  console.log(`\nТекущая версия: ${ver}`);
  console.log('Выберите тип обновления версии package.json:');
  BUMP_OPTIONS.forEach((o, i) => console.log(`  ${i + 1}) ${o.label}`));
  const bumpIndex = await askChoice(rl, 'Выбор [1]: ', BUMP_OPTIONS.length);
  const selectedBump = BUMP_OPTIONS[bumpIndex];
  const skipVersionBump = selectedBump.type === null;
  const newVersion = skipVersionBump ? ver : bumpVersion(ver, selectedBump.type);
  console.log(skipVersionBump ? `Версия остаётся: ${ver}` : `Новая версия: ${newVersion}`);

  // category
  console.log('\nКатегория:');
  CATEGORIES.forEach((c, i) => console.log(`  ${i + 1}) ${c}`));
  const catIndex = await askChoice(rl, 'Выбор [1]: ', CATEGORIES.length);
  const category = CATEGORIES[catIndex];

  // collect one block: area + subArea + descriptions
  const collectDescriptions = async () => {
    const first = await ask(rl, 'Описание: ');
    if (!first) return null;
    const list = [first];
    while (true) {
      const extra = await ask(rl, 'Ещё одно описание? (Enter — пропустить): ');
      if (!extra) break;
      list.push(extra);
    }
    return list;
  };

  const buildAreaLine = (area, subArea) => {
    if (!area) return null;
    if (area.toLowerCase() === 'общее') return 'общее';
    return `функциональность "${area}"${subArea ? ` / "${subArea}"` : ''}`;
  };

  const blocks = [];

  // первый блок — функциональность опциональна
  const firstArea = await ask(rl, '\nФункциональность (Enter — пропустить): ');
  const firstSubArea = firstArea ? await ask(rl, 'Подраздел (Enter — пропустить): ') : '';
  const firstDescs = await collectDescriptions();
  if (!firstDescs) {
    console.log('Описание не введено, отмена.\n');
    rl.close();
    process.exit(1);
  }
  blocks.push({ area: firstArea, subArea: firstSubArea, descriptions: firstDescs });

  // дополнительные блоки
  while (true) {
    const nextArea = await ask(rl, '\nЕщё одна функциональность? (Enter — завершить): ');
    if (!nextArea) break;
    const nextSubArea = await ask(rl, 'Подраздел (Enter — пропустить): ');
    const nextDescs = await collectDescriptions();
    if (!nextDescs) break;
    blocks.push({ area: nextArea, subArea: nextSubArea, descriptions: nextDescs });
  }

  const doCommit = await askYesNo(rl, '\nСделать коммит сразу? (y/n) [y]: ', true);

  rl.close();

  const body = blocks
    .map((block) => {
      const areaLine = buildAreaLine(block.area, block.subArea);
      return areaLine
        ? `- ${areaLine}\n${block.descriptions.map((d) => `    - ${d}`).join('\n')}`
        : block.descriptions.map((d) => `- ${d}`).join('\n');
    })
    .join('\n');

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

  const versionNote = skipVersionBump
    ? '(версия package.json не изменена)'
    : `→ версия ${newVersion}`;

  if (doCommit) {
    execSync(`git add ${changedFiles.join(' ')}`);
    execSync(`git commit -m "chore: update changelog [${newVersion}]"`);
    console.log(`\n✓ ${changedFiles.join(', ')} обновлены и закоммичены ${versionNote}\n`);
  } else {
    console.log(`\n✓ ${changedFiles.join(', ')} обновлены ${versionNote}`);
    console.log('  Изменения не закоммичены — добавьте их в свой коммит вручную.\n');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
