#!/usr/bin/env node

/**
 * Генератор WireMock-моков из OpenAPI/Swagger (YAML) спецификации.
 *
 * Запуск:
 *   node generate-wiremock.js [директория-со-schema.yaml] [папка-вывода]
 *
 * По умолчанию:
 *   директория схемы: текущая рабочая директория (там ищется файл schema.yaml)
 *   вывод:            <директория-схемы>/wiremock  (mappings + __files)
 */

const path = require('path');
const fs = require('fs-extra');
const SwaggerParser = require('@apidevtools/swagger-parser');

const SCHEMA_DIR = path.resolve(process.argv[2] || process.cwd());
const SCHEMA_PATH = path.join(SCHEMA_DIR, 'schema.yaml');
const OUTPUT_DIR = path.resolve(process.argv[3] || path.join(SCHEMA_DIR, 'wiremock'));
const MAPPINGS_DIR = path.join(OUTPUT_DIR, 'mappings');
const FILES_DIR = path.join(OUTPUT_DIR, '__files');

// Порядок не важен, но перечисляем только реальные HTTP-методы,
// чтобы не задеть служебные ключи path item'а (parameters, summary, $ref и т.д.)
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'];

// Глубина, дальше которой мок не генерируется — защита от очень глубоких
// (в т.ч. циклических через $ref) схем.
const MAX_DEPTH = 6;

main().catch((err) => {
  console.error('Генерация не удалась:', err);
  process.exit(1);
});

async function main() {
  if (!fs.existsSync(SCHEMA_PATH)) {
    throw new Error(`Файл schema.yaml не найден по пути: ${SCHEMA_PATH}`);
  }

  console.log(`Читаю и разрешаю $ref в схеме: ${SCHEMA_PATH}`);
  const api = await SwaggerParser.dereference(SCHEMA_PATH, {
    dereference: { circular: 'ignore' },
  });

  fs.ensureDirSync(MAPPINGS_DIR);
  fs.ensureDirSync(FILES_DIR);

  const existingSlugs = new Set(
    fs.readdirSync(MAPPINGS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -5))
  );

  const isIncremental = existingSlugs.size > 0;
  if (isIncremental) {
    console.log(`Найдено ${existingSlugs.size} существующих маппингов — выполняю инкрементальное обновление...`);
  } else {
    fs.emptyDirSync(MAPPINGS_DIR);
    fs.emptyDirSync(FILES_DIR);
  }

  const usedSlugs = new Set();
  const processedSlugs = new Set();
  let added = 0, updated = 0, removed = 0, unchanged = 0, noBodyCount = 0;

  for (const [routePath, pathItem] of Object.entries(api.paths || {})) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      const slug = uniqueSlug(slugify(routePath, method), usedSlugs);
      processedSlugs.add(slug);

      const { status, contentType, bodySchema, bodyExample } = resolveResponse(operation);
      const responseFileName = `${slug}-response.json`;

      const newMapping = { request: buildRequest(method, routePath), response: { status } };
      let newBody;

      if (contentType) {
        newBody = bodyExample !== undefined ? bodyExample : generateMock(bodySchema, new Set(), 0);
        newMapping.response.headers = { 'Content-Type': contentType };
        newMapping.response.bodyFileName = responseFileName;
      } else {
        noBodyCount++;
      }

      if (!isIncremental) {
        if (newBody !== undefined) fs.writeJsonSync(path.join(FILES_DIR, responseFileName), newBody, { spaces: 2 });
        fs.writeJsonSync(path.join(MAPPINGS_DIR, `${slug}.json`), newMapping, { spaces: 2 });
        added++;
        if (added % 200 === 0) console.log(`  ...обработано ${added} эндпоинтов`);
        continue;
      }

      if (!existingSlugs.has(slug)) {
        if (newBody !== undefined) fs.writeJsonSync(path.join(FILES_DIR, responseFileName), newBody, { spaces: 2 });
        fs.writeJsonSync(path.join(MAPPINGS_DIR, `${slug}.json`), newMapping, { spaces: 2 });
        added++;
        console.log(`  + ${slug}`);
        continue;
      }

      // Существующий эндпоинт — сравниваем с тем, что сгенерировано сейчас
      const existingMapping = fs.readJsonSync(path.join(MAPPINGS_DIR, `${slug}.json`));
      const mappingChanged = JSON.stringify(existingMapping) !== JSON.stringify(newMapping);

      let bodyChanged = false;
      if (newBody !== undefined) {
        const bodyFilePath = path.join(FILES_DIR, responseFileName);
        if (!fs.existsSync(bodyFilePath)) {
          bodyChanged = true;
        } else {
          bodyChanged = JSON.stringify(fs.readJsonSync(bodyFilePath)) !== JSON.stringify(newBody);
        }
      }

      if (mappingChanged || bodyChanged) {
        if (newBody !== undefined) fs.writeJsonSync(path.join(FILES_DIR, responseFileName), newBody, { spaces: 2 });
        fs.writeJsonSync(path.join(MAPPINGS_DIR, `${slug}.json`), newMapping, { spaces: 2 });
        updated++;
        console.log(`  ~ ${slug}`);
      } else {
        unchanged++;
      }
    }
  }

  // Удаляем маппинги для эндпоинтов, которых больше нет в схеме
  if (isIncremental) {
    for (const slug of existingSlugs) {
      if (!processedSlugs.has(slug)) {
        fs.removeSync(path.join(MAPPINGS_DIR, `${slug}.json`));
        const bodyFile = path.join(FILES_DIR, `${slug}-response.json`);
        if (fs.existsSync(bodyFile)) fs.removeSync(bodyFile);
        removed++;
        console.log(`  - ${slug}`);
      }
    }
  }

  if (!isIncremental) {
    console.log(`\nГотово: ${added} mapping(ов) -> ${MAPPINGS_DIR}`);
    console.log(`Из них без тела ответа (например, 204): ${noBodyCount}`);
  } else {
    console.log(`\nГотово: добавлено ${added}, обновлено ${updated}, без изменений ${unchanged}, удалено ${removed}`);
  }
  console.log(`Папки: ${MAPPINGS_DIR}`);
}

/**
 * Формирует блок "request" мапинга: метод + путь.
 * Если в пути есть параметры вида {owner}, используется urlPathPattern
 * с регуляркой "любой сегмент без слэша" вместо конкретного значения.
 */
function buildRequest(method, routePath) {
  const request = { method: method.toUpperCase() };

  if (routePath.includes('{')) {
    const pattern = routePath
      .split('/')
      .map((segment) => (/^\{[^}]+\}$/.test(segment) ? '[^/]+' : escapeRegExp(segment)))
      .join('/');
    request.urlPathPattern = pattern;
  } else {
    request.urlPath = routePath;
  }

  return request;
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Выбирает "основной" ответ операции (первый успешный 2xx, иначе default,
 * иначе первый попавшийся) и достаёт из него схему/пример JSON-тела.
 */
function resolveResponse(operation) {
  const responses = operation.responses || {};
  const codes = Object.keys(responses);
  const chosenCode =
    codes.find((c) => /^2\d\d$/.test(c)) || codes.find((c) => c === 'default') || codes[0];

  if (!chosenCode) {
    return { status: 200, contentType: null };
  }

  const status = chosenCode === 'default' ? 200 : parseInt(chosenCode, 10);
  const responseObj = responses[chosenCode] || {};
  const content = responseObj.content || {};
  const contentType = content['application/json'] ? 'application/json' : Object.keys(content)[0];

  if (!contentType) {
    return { status, contentType: null };
  }

  const mediaType = content[contentType];
  const bodySchema = mediaType.schema;
  const bodyExample = extractExample(mediaType, bodySchema);

  return { status, contentType, bodySchema, bodyExample };
}

/** Достаёт готовый example/examples, если он явно указан в спеке. */
function extractExample(mediaType, schema) {
  if (mediaType) {
    if (mediaType.example !== undefined) return mediaType.example;
    if (mediaType.examples) {
      const first = Object.values(mediaType.examples)[0];
      if (first && first.value !== undefined) return first.value;
    }
  }
  if (schema && schema.example !== undefined) return schema.example;
  return undefined;
}

/**
 * Генерирует мок-значение по JSON-схеме, когда в спеке нет готового example.
 * seen — множество схем на текущем пути рекурсии (защита от циклических $ref),
 * depth — жёсткий лимит глубины на случай очень вложенных схем.
 */
function generateMock(schema, seen, depth) {
  if (!schema || depth > MAX_DEPTH || seen.has(schema)) return null;
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];

  seen.add(schema);
  let result;

  try {
    if (schema.allOf) {
      // Объединяем все составляющие allOf в один объект
      result = schema.allOf.reduce((acc, sub) => {
        const value = generateMock(sub, seen, depth + 1);
        return value && typeof value === 'object' && !Array.isArray(value) ? { ...acc, ...value } : acc;
      }, {});
    } else if (schema.oneOf) {
      result = generateMock(schema.oneOf[0], seen, depth + 1);
    } else if (schema.anyOf) {
      result = generateMock(schema.anyOf[0], seen, depth + 1);
    } else {
      const type = schema.type || (schema.properties ? 'object' : undefined);

      switch (type) {
        case 'string':
          result = mockString(schema);
          break;
        case 'integer':
          result = schema.minimum ?? 1;
          break;
        case 'number':
          result = schema.minimum ?? 1.5;
          break;
        case 'boolean':
          result = true;
          break;
        case 'array': {
          const item = generateMock(schema.items, seen, depth + 1);
          result = item === undefined ? [] : [item];
          break;
        }
        case 'object': {
          const obj = {};
          for (const [key, propSchema] of Object.entries(schema.properties || {})) {
            obj[key] = generateMock(propSchema, seen, depth + 1);
          }
          result = obj;
          break;
        }
        default:
          result = {};
      }
    }
  } finally {
    seen.delete(schema);
  }

  return result;
}

/** Простейшая генерация строк с учётом распространённых форматов OpenAPI. */
function mockString(schema) {
  switch (schema.format) {
    case 'date-time':
      return '2024-01-01T00:00:00Z';
    case 'date':
      return '2024-01-01';
    case 'email':
      return 'user@example.com';
    case 'uuid':
      return '3fa85f64-5717-4562-b3fc-2c963f66afa6';
    case 'uri':
    case 'url':
      return 'https://example.com';
    case 'byte':
      return 'c3RyaW5n';
    case 'password':
      return '********';
    default:
      return 'string';
  }
}

/** Превращает "/repos/{owner}/{repo}" + "get" в "get_repos_owner_repo". */
function slugify(routePath, method) {
  const clean = routePath
    .replace(/[{}]/g, '')
    .replace(/^\//, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${method}_${clean || 'root'}`;
}

/** Гарантирует уникальность имени файла, если после очистки слаги совпали. */
function uniqueSlug(base, used) {
  let slug = base;
  let i = 2;
  while (used.has(slug)) {
    slug = `${base}_${i++}`;
  }
  used.add(slug);
  return slug;
}
