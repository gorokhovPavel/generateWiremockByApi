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
    if (['y', 'д'].includes(input.toLowerCase())) return true;
    if (['n', 'н'].includes(input.toLowerCase())) return false;
    console.log('  ✗ Некорректный ввод — введите y/д или n/н');
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

function prependToChangelog(version, sections, skipVersion) {
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
}

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

  // helpers
  const collectDescriptions = async () => {
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

  // sections: [{ category, blocks: [{ area, subArea, descriptions }] }]
  const sections = [];

  const collectCategoryBlock = async (category) => {
    const blocks = [];

    // первая функциональность внутри категории
    const firstAreaRaw = await ask(rl, '\nФункциональность (название раздела / 1 — общее / Enter — пропустить): ');
    const firstArea = resolveArea(firstAreaRaw);
    const firstSubArea = firstArea && firstArea !== 'общее' ? await ask(rl, `Подраздел (будет добавлен как "${firstArea} / ..." / Enter — пропустить): `) : '';
    const firstDescs = await collectDescriptions();
    if (!firstDescs) return null;
    blocks.push({ area: firstArea, subArea: firstSubArea, descriptions: firstDescs });

    // дополнительные функциональности в той же категории
    while (true) {
      const nextAreaRaw = await ask(rl, '\nЕщё одна функциональность? (название раздела / 1 — общее / Enter — пропустить и перейти дальше): ');
      if (!nextAreaRaw) break;
      const nextArea = resolveArea(nextAreaRaw);
      const nextSubArea = nextArea && nextArea !== 'общее' ? await ask(rl, `Подраздел (будет добавлен как "${nextArea} / ..." / Enter — пропустить): `) : '';
      const nextDescs = await collectDescriptions();
      if (!nextDescs) break;
      blocks.push({ area: nextArea, subArea: nextSubArea, descriptions: nextDescs });
    }

    return { category, blocks };
  };

  // первая категория — обязательна
  console.log('\nКатегория:');
  CATEGORIES.forEach((c, i) => console.log(`  ${i + 1}) ${c}`));
  const firstCatIdx = await askChoice(rl, 'Выбор [1]: ', CATEGORIES.length);
  const firstSection = await collectCategoryBlock(CATEGORIES[firstCatIdx]);
  if (!firstSection) {
    console.log('Описание не введено, отмена.\n');
    rl.close();
    process.exit(1);
  }
  sections.push(firstSection);

  // дополнительные категории
  while (true) {
    console.log('\nДобавить ещё одну категорию?');
    CATEGORIES.forEach((c, i) => console.log(`  ${i + 1}) ${c}`));
    const nextCatRaw = await ask(rl, 'Выбор (Enter — завершить): ');
    if (!nextCatRaw) break;
    const nextCatIdx = parseInt(nextCatRaw, 10) - 1;
    if (isNaN(nextCatIdx) || nextCatIdx < 0 || nextCatIdx >= CATEGORIES.length) {
      console.log(`  ✗ Некорректный ввод — введите число от 1 до ${CATEGORIES.length}`);
      continue;
    }
    const nextSection = await collectCategoryBlock(CATEGORIES[nextCatIdx]);
    if (!nextSection) break;
    sections.push(nextSection);
  }

  const commitInput = await ask(rl, '\nСделать коммит сразу? (1 — да, Enter — нет): ');
  const doCommit = commitInput.trim() === '1';

  rl.close();

  const builtSections = sections.map(({ category, blocks }) => {
    const body = blocks
      .map(({ area, subArea, descriptions }) => {
        const areaLine = buildAreaLine(area, subArea);
        return areaLine
          ? `- ${areaLine}\n${descriptions.map((d) => `    - ${d}`).join('\n')}`
          : descriptions.map((d) => `- ${d}`).join('\n');
      })
      .join('\n');
    return { category, body };
  });

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
