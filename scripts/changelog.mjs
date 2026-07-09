#!/usr/bin/env node
import readline from 'readline';
import fs from 'fs';
import { execSync } from 'child_process';

// --- constants ---

const CHANGELOG_PATH = 'CHANGELOG.md';

const CATEGORIES = [
  'Добавлено',
  'Изменено',
  'Исправлено',
  'Удалено',
];

const BUMP_OPTIONS = [
  { label: 'patch',         type: 'patch' },
  { label: 'minor',         type: 'minor' },
  { label: 'major',         type: 'major' },
  { label: 'не обновляем', type: null    },
];

// --- prompt helpers ---

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

// --- pure data helpers ---

const resolveArea = (input) => {
  if (!input) return '';
  if (input.trim() === '1') return 'общее';
  return input;
};

const buildAreaLine = (area, subArea) => {
  if (!area) return null;
  if (area.toLowerCase() === 'общее') return 'общее';
  return `функциональность "${area}"${subArea ? ` / "${subArea}"` : ''}`;
};

const buildBlockBody = ({ area, subArea, descriptions }) => {
  const areaLine = buildAreaLine(area, subArea);
  return areaLine
    ? `- ${areaLine}\n${descriptions.map((d) => `    - ${d}`).join('\n')}`
    : descriptions.map((d) => `- ${d}`).join('\n');
};

// --- version helpers ---

const currentVersion = () => {
  const content = fs.readFileSync(CHANGELOG_PATH, 'utf8');
  const match = content.match(/## \[(\d+\.\d+\.\d+)\]/);
  return match ? match[1] : '0.0.0';
};

const bumpVersion = (version, type) => {
  const [major, minor, patch] = version.split('.').map(Number);
  if (type === 'major') return `${major + 1}.0.0`;
  if (type === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
};

const todayDate = () => {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
};

// --- git helpers ---

const recentCommits = () => {
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
};

// --- changelog writer ---

const prependToChangelog = (version, sections, skipVersion) => {
  const content = fs.readFileSync(CHANGELOG_PATH, 'utf8');
  const sectionsText = sections
    .map(({ category, body }) => `### ${category}\n${body}`)
    .join('\n\n');
  const entry = skipVersion
    ? [sectionsText, ``, ``].join('\n')
    : [`## [${version}] - ${todayDate()}`, ``, sectionsText, ``, ``].join('\n');

  const firstEntry = content.search(/^## /m);
  const updated =
    firstEntry === -1
      ? content.trimEnd() + '\n\n' + entry
      : content.slice(0, firstEntry) + entry + content.slice(firstEntry);

  fs.writeFileSync(CHANGELOG_PATH, updated, 'utf8');
};

// --- input collectors ---

const collectDescriptions = async (rl) => {
  const first = await ask(rl, 'Описание: ');
  if (!first) return null;
  const list = [first];
  while (true) {
    const extra = await ask(rl, 'Ещё одно описание? (текст — добавить строку / Enter — пропустить): ');
    if (!extra) break;
    list.push(extra);
  }
  return list;
};

// exitOnEmptyArea: true — пустой ввод завершает цикл (для повторных блоков)
//                 false — пустой ввод пропускает поле (для первого блока)
const collectAreaBlock = async (rl, areaPrompt, exitOnEmptyArea = false) => {
  const areaRaw = await ask(rl, areaPrompt);
  if (!areaRaw && exitOnEmptyArea) return null;
  const area = resolveArea(areaRaw);
  const subArea = area && area !== 'общее'
    ? await ask(rl, `Подраздел (будет добавлен как "${area} / ..." / Enter — пропустить): `)
    : '';
  const descriptions = await collectDescriptions(rl);
  if (!descriptions) return null;
  return { area, subArea, descriptions };
};

const collectCategorySection = async (rl, category) => {
  const blocks = [];

  const first = await collectAreaBlock(
    rl,
    '\nФункциональность (название раздела / 1 — общее / Enter — пропустить): ',
    false
  );
  if (!first) return null;
  blocks.push(first);

  while (true) {
    const next = await collectAreaBlock(
      rl,
      '\nЕщё одна функциональность? (название раздела / 1 — общее / Enter — пропустить и перейти далее): ',
      true
    );
    if (!next) break;
    blocks.push(next);
  }

  return { category, blocks };
};

// --- main ---

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\n─────────────────────────────────');
  console.log('  📋 Обновление CHANGELOG');
  console.log('─────────────────────────────────');

  const commits = recentCommits();
  if (commits !== '(нет коммитов)') {
    console.log('\nПоследние коммиты:\n');
    console.log(commits.split('\n').map((l) => '  ' + l).join('\n'));
    console.log('');
  }

  // версия
  const ver = currentVersion();
  console.log(`\nТекущая версия: ${ver}`);
  console.log('Выберите тип обновления версии package.json:');
  BUMP_OPTIONS.forEach((o, i) => console.log(`  ${i + 1}) ${o.label}`));
  const bumpIndex = await askChoice(rl, 'Выбор [1]: ', BUMP_OPTIONS.length);
  const selectedBump = BUMP_OPTIONS[bumpIndex];
  const skipVersionBump = selectedBump.type === null;
  const newVersion = skipVersionBump ? ver : bumpVersion(ver, selectedBump.type);
  console.log(skipVersionBump ? `Версия остаётся: ${ver}` : `Новая версия: ${newVersion}`);

  // секции
  const showCategories = () => {
    console.log('\nКатегория:');
    CATEGORIES.forEach((c, i) => console.log(`  ${i + 1}) ${c}`));
  };

  const sections = [];

  showCategories();
  const firstCatIdx = await askChoice(rl, 'Выбор [1]: ', CATEGORIES.length);
  const firstSection = await collectCategorySection(rl, CATEGORIES[firstCatIdx]);
  if (!firstSection) {
    console.log('Описание не введено, отмена.\n');
    rl.close();
    process.exit(1);
  }
  sections.push(firstSection);

  while (true) {
    showCategories();
    const nextCatRaw = await ask(rl, 'Добавить ещё одну категорию? Выбор (Enter — завершить): ');
    if (!nextCatRaw) break;
    const nextCatIdx = parseInt(nextCatRaw, 10) - 1;
    if (isNaN(nextCatIdx) || nextCatIdx < 0 || nextCatIdx >= CATEGORIES.length) {
      console.log(`  ✗ Некорректный ввод — введите число от 1 до ${CATEGORIES.length}`);
      continue;
    }
    const nextSection = await collectCategorySection(rl, CATEGORIES[nextCatIdx]);
    if (!nextSection) break;
    sections.push(nextSection);
  }

  const commitInput = await ask(rl, '\nСделать коммит сразу? (1 — да, Enter — нет): ');
  const doCommit = commitInput.trim() === '1';

  rl.close();

  // запись и коммит
  const builtSections = sections.map(({ category, blocks }) => ({
    category,
    body: blocks.map(buildBlockBody).join('\n'),
  }));

  prependToChangelog(newVersion, builtSections, skipVersionBump);

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
