#!/usr/bin/env node

/**
 * Генератор WireMock-моков из OpenAPI/Swagger (YAML) спецификации.
 *
 * Запуск:
 *   node generate-wiremock.js [директория-со-schema.yaml] [папка-вывода]
 *
 * По умолчанию:
 *   директория схемы: папка самого скрипта (там же лежит schema.yaml)
 *   вывод:            та же папка (mappings/ и __files/ рядом со скриптом)
 */

const path = require('path');
const fs = require('fs-extra');
const SwaggerParser = require('@apidevtools/swagger-parser');

const SCHEMA_DIR = path.resolve(process.argv[2] || __dirname);
const SCHEMA_PATH = path.join(SCHEMA_DIR, 'schema.yaml');
const OUTPUT_DIR = path.resolve(process.argv[3] || SCHEMA_DIR);
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

      // Существующий эндпоинт — сравниваем семантически, пишем только то что реально изменилось
      const existingMapping = fs.readJsonSync(path.join(MAPPINGS_DIR, `${slug}.json`));
      const mappingChanged = !isMappingEqual(existingMapping, newMapping);

      let mergedBody;
      let bodyChanged = false;
      if (newBody !== undefined) {
        const bodyFilePath = path.join(FILES_DIR, responseFileName);
        if (!fs.existsSync(bodyFilePath)) {
          mergedBody = newBody;
          bodyChanged = true;
        } else {
          const existingBody = fs.readJsonSync(bodyFilePath);
          mergedBody = deepMergePreferExisting(newBody, existingBody);
          bodyChanged = JSON.stringify(existingBody) !== JSON.stringify(mergedBody);
        }
      }

      if (mappingChanged) {
        fs.writeJsonSync(path.join(MAPPINGS_DIR, `${slug}.json`), newMapping, { spaces: 2 });
      }
      if (bodyChanged && mergedBody !== undefined) {
        fs.writeJsonSync(path.join(FILES_DIR, responseFileName), mergedBody, { spaces: 2 });
      }

      if (mappingChanged || bodyChanged) {
        const what = [mappingChanged && 'mapping', bodyChanged && 'body'].filter(Boolean).join('+');
        updated++;
        console.log(`  ~ ${slug} [${what}]`);
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
 * seen      — множество схем на текущем пути рекурсии (защита от циклических $ref)
 * depth     — жёсткий лимит глубины на случай очень вложенных схем
 * fieldName — имя поля-владельца; передаётся в leaf-генераторы для семантических значений
 */
function generateMock(schema, seen, depth, fieldName = '') {
  if (!schema || depth > MAX_DEPTH || seen.has(schema)) return null;
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];

  seen.add(schema);
  let result;

  try {
    if (schema.allOf) {
      result = schema.allOf.reduce((acc, sub) => {
        const value = generateMock(sub, seen, depth + 1, fieldName);
        return value && typeof value === 'object' && !Array.isArray(value) ? { ...acc, ...value } : acc;
      }, {});
    } else if (schema.oneOf) {
      result = generateMock(schema.oneOf[0], seen, depth + 1, fieldName);
    } else if (schema.anyOf) {
      result = generateMock(schema.anyOf[0], seen, depth + 1, fieldName);
    } else {
      const type = schema.type || (schema.properties ? 'object' : undefined);

      switch (type) {
        case 'string':
          result = mockString(schema, fieldName);
          break;
        case 'integer':
          result = mockInteger(schema, fieldName);
          break;
        case 'number':
          result = mockNumber(schema, fieldName);
          break;
        case 'boolean':
          result = mockBoolean(fieldName);
          break;
        case 'array': {
          const item = generateMock(schema.items, seen, depth + 1, fieldName);
          result = item === undefined ? [] : [item];
          break;
        }
        case 'object': {
          const obj = {};
          for (const [key, propSchema] of Object.entries(schema.properties || {})) {
            obj[key] = generateMock(propSchema, seen, depth + 1, key);
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

/** Генерация строк: сначала format из схемы, затем эвристика по имени поля. */
function mockString(schema, fieldName = '') {
  switch (schema.format) {
    case 'date-time': return '2024-01-01T00:00:00Z';
    case 'date':      return '2024-01-01';
    case 'time':      return '12:00:00';
    case 'email':     return 'user@example.com';
    case 'uuid':      return '3fa85f64-5717-4562-b3fc-2c963f66afa6';
    case 'uri':
    case 'url':       return 'https://example.com';
    case 'byte':      return 'c3RyaW5n';
    case 'binary':    return '<binary>';
    case 'password':  return '********';
    case 'hostname':  return 'example.com';
    case 'ipv4':      return '192.168.0.1';
    case 'ipv6':      return '::1';
  }

  const n = fieldName.toLowerCase();

  if (/email/.test(n))                              return 'user@example.com';
  if (/(url|uri|link|href|website|homepage)/.test(n)) return 'https://example.com';
  if (/(uuid|guid)/.test(n))                        return '3fa85f64-5717-4562-b3fc-2c963f66afa6';
  if (/(avatar|photo|picture|image|thumbnail|icon|logo)/.test(n)) return 'https://example.com/image.png';
  if (/(phone|mobile|tel)/.test(n))                 return '+1-555-000-0000';
  if (/first.?name|firstname|given.?name/.test(n))  return 'John';
  if (/last.?name|lastname|surname|family.?name/.test(n)) return 'Doe';
  if (/(display.?name|full.?name|fullname)/.test(n)) return 'John Doe';
  if (/(username|login)/.test(n))                   return 'john_doe';
  if (/\bname\b/.test(n))                           return 'John Doe';
  if (/(description|summary|overview|bio|about)/.test(n)) return 'Example description';
  if (/(message|body|content|text|comment|note|remark)/.test(n)) return 'Example text content';
  if (/(title|heading|caption|subject)/.test(n))    return 'Example Title';
  if (/(label|badge|tag)/.test(n))                  return 'example-tag';
  if (/\bslug\b/.test(n))                           return 'example-slug';
  if (/(street|addr)/.test(n))                      return '123 Main Street';
  if (/\bcity\b/.test(n))                           return 'New York';
  if (/\bcountry\b/.test(n))                        return 'US';
  if (/(state|province|region)/.test(n))            return 'NY';
  if (/(zip|postal)/.test(n))                       return '10001';
  if (/\bstatus\b/.test(n))                         return 'active';
  if (/(color|colour)/.test(n))                     return '#FF5733';
  if (/\bcurrency\b/.test(n))                       return 'USD';
  if (/(language|locale|lang)/.test(n))             return 'en';
  if (/(timezone|time.?zone)/.test(n))              return 'UTC';
  if (/(company|organization|employer)/.test(n))    return 'Example Corp';
  if (/\bversion\b/.test(n))                        return '1.0.0';
  if (/(type|kind|category|genre)/.test(n))         return 'default';
  if (/(role|permission|scope)/.test(n))            return 'user';
  if (/(token|api.?key|secret)/.test(n))            return 'tok_example_1234567890abcdef';
  if (/(hash|checksum|sha|md5)/.test(n))            return 'abc123def456';
  if (/\bkey\b/.test(n))                            return 'example_key';
  if (/(path|route|endpoint)/.test(n))              return '/example/path';
  if (/code/.test(n))                               return 'EXAMPLE_CODE';
  if (/\bid$/.test(n))                              return 'id_example_1';

  return 'string';
}

/** Генерация целых чисел с учётом семантики имени поля. */
function mockInteger(schema, fieldName = '') {
  if (schema.minimum !== undefined) return schema.minimum;

  const n = fieldName.toLowerCase();

  if (/\bage\b/.test(n))                        return 25;
  if (/year/.test(n))                           return 2024;
  if (/(limit|per.?page|page.?size)/.test(n))  return 20;
  if (/(page|offset|skip|index)/.test(n))       return 1;
  if (/(count|total|size|length|quantity)/.test(n)) return 10;
  if (/(percent|percentage)/.test(n))           return 50;
  if (/(rating|score|rank|priority)/.test(n))   return 4;
  if (/(price|cost|amount|sum)/.test(n))        return 100;
  if (/\bport\b/.test(n))                       return 8080;
  if (/(timeout|ttl|expir)/.test(n))            return 30;
  if (/\bweight\b/.test(n))                     return 70;
  if (/\bheight\b/.test(n))                     return 180;
  if (/\bwidth\b/.test(n))                      return 1920;
  if (/\bid\b/.test(n))                         return 1;

  return 1;
}

/** Генерация дробных чисел с учётом семантики имени поля. */
function mockNumber(schema, fieldName = '') {
  if (schema.minimum !== undefined) return schema.minimum;

  const n = fieldName.toLowerCase();

  if (/(price|cost|amount|sum)/.test(n))   return 99.99;
  if (/(percent|percentage|rate)/.test(n)) return 0.5;
  if (/(rating|score)/.test(n))            return 4.5;
  if (/lat(itude)?/.test(n))               return 40.7128;
  if (/(lon(gitude)?|lng)/.test(n))        return -74.006;
  if (/\bweight\b/.test(n))                return 70.5;
  if (/\bheight\b/.test(n))                return 180.0;
  if (/(temp(erature)?)/.test(n))          return 20.5;

  return 1.5;
}

/** Генерация булевых: поля с негативным смыслом → false, остальные → true. */
function mockBoolean(fieldName = '') {
  const n = fieldName.toLowerCase();
  if (/(deleted|disabled|hidden|archived|suspended|banned|blocked|closed|locked)/.test(n)) return false;
  return true;
}

/**
 * Сливает newVal и existingVal: существующие значения имеют приоритет.
 * Для объектов — рекурсивно: новые ключи из newVal добавляются, существующие не трогаются.
 * Для примитивов, массивов и null — возвращает existingVal если он определён.
 */
function deepMergePreferExisting(newVal, existingVal) {
  if (isPlainObject(newVal) && isPlainObject(existingVal)) {
    const result = { ...existingVal };
    for (const key of Object.keys(newVal)) {
      result[key] = key in existingVal
        ? deepMergePreferExisting(newVal[key], existingVal[key])
        : newVal[key];
    }
    return result;
  }
  return existingVal !== undefined ? existingVal : newVal;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Семантическое сравнение двух маппингов — только значимые поля,
 * порядок ключей в JSON-файле не влияет на результат.
 */
function isMappingEqual(existing, generated) {
  const er = existing.request || {};
  const gr = generated.request || {};
  const eresp = existing.response || {};
  const gresp = generated.response || {};

  return (
    er.method === gr.method &&
    (er.urlPath ?? null) === (gr.urlPath ?? null) &&
    (er.urlPathPattern ?? null) === (gr.urlPathPattern ?? null) &&
    eresp.status === gresp.status &&
    (eresp.headers?.['Content-Type'] ?? null) === (gresp.headers?.['Content-Type'] ?? null) &&
    (eresp.bodyFileName ?? null) === (gresp.bodyFileName ?? null)
  );
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
