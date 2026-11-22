i# Генератор WireMock-моков из OpenAPI/Swagger

Скрипт читает `schema.yaml` и генерирует stub-файлы для WireMock: папки `mappings/` и `__files/`.  
При повторном запуске работает инкрементально — добавляет новые эндпоинты, обновляет изменившиеся, удаляет удалённые.

---

## Подключение к проекту

### 1. Скопировать скрипт

Скопируйте файл `wiremock/generate-wiremock.js` в любую папку вашего проекта.  
Рекомендуется класть его рядом с `schema.yaml` — например, в `wiremock/`.

```
your-project/
└── wiremock/
    ├── generate-wiremock.js   ← скрипт
    └── schema.yaml            ← ваша OpenAPI/Swagger спецификация
```

### 2. Установить зависимости

Если в проекте ещё нет нужных пакетов — выполните в корне проекта:

```bash
npm install @apidevtools/swagger-parser fs-extra
```

### 3. Добавить npm-скрипт (опционально)

Выполните в корне проекта:

```bash
npm pkg set scripts.wiremock:generate="node wiremock/generate-wiremock.js"
```

Или вручную добавьте в `package.json` в блок `"scripts"`:

```json
"wiremock:generate": "node wiremock/generate-wiremock.js"
```

### 4. Подготовить схему

Положите файл `schema.yaml` (OpenAPI 3.x или Swagger 2.x) в ту же папку, что и скрипт.

---

## Запуск

```bash
# Через npm-скрипт
npm run wiremock:generate

# Или напрямую
node wiremock/generate-wiremock.js
```

После выполнения рядом со скриптом появятся:

```
wiremock/
├── generate-wiremock.js
├── schema.yaml
├── mappings/       ← stub-маппинги (по одному файлу на эндпоинт)
└── __files/        ← тела ответов в JSON
```

---

## Нестандартные пути

Скрипт принимает два опциональных аргумента:

```bash
node generate-wiremock.js [папка-со-schema.yaml] [папка-вывода]
```

Пример — схема в корне проекта, вывод в отдельную папку:

```bash
node wiremock/generate-wiremock.js . ./wiremock-output
```

---

## Поведение при повторном запуске

| Ситуация | Действие |
|---|---|
| Папка `mappings/` пуста или отсутствует | Полная генерация |
| Маппинги уже есть, схема не изменилась | Ничего не меняется |
| В схеме появился новый эндпоинт | Добавляется новый маппинг |
| Эндпоинт изменился (статус, тело ответа) | Маппинг перезаписывается |
| Эндпоинт удалён из схемы | Маппинг и файл тела удаляются |


//

// rsbuild.config.ts
import { defineConfig, rspack } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSvgr } from '@rsbuild/plugin-svgr';
import { pluginTypeCheck } from '@rsbuild/plugin-type-check';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';

import path from 'path';
import fs from 'fs';
import pkg from './package.json';
import featureFlags from './src/shared/lib/featureFlags/config.json';
import featureFlagsOverride from './src/shared/lib/featureFlags/configOverride.json';
import federationConfig from './federation.config.json';

// --- Конфигурация окружения ---
const supportedLocales = ['en-US', 'ru'];
const isLocalDevEnv = process.env.NODE_ENV === 'development';
const isMockMode = process.env.MOCK_MODE === 'true';
const isWiremockMode = process.env.WIREMOCK_MODE === 'true';
const deps = pkg.dependencies;

// Объединённые флаги функций — используются в приложении через FEATURE_FLAGS
const mergedFeatureFlags = {
  ...featureFlags,
  ...featureFlagsOverride,
};

// --- Загрузка middleware для mock-сервера ---
const mockMiddlewaresPath = path.resolve(__dirname, './src/shared/api/mocks/mock-server/middlewares');
const mockMiddlewares = isMockMode && fs.existsSync(mockMiddlewaresPath) ? require(mockMiddlewaresPath) : {};

const overrideFilePath = path.resolve(
  __dirname,
  './src/shared/api/mocks/mock-server/middlewares/_middlewares_override.js',
);
const overrideMiddlewares = fs.existsSync(overrideFilePath) ? require(overrideFilePath) : {};

// --- Добавить задержку к middleware (аналог webpack-логики) ---
const withDelay = (middleware: any, delay = 1000) => {
  return (req: any, res: any, next: any) => {
    setTimeout(() => {
      middleware.middleware(req, res, next);
    }, delay);
  };
};

// --- Middleware для принудительной ошибки (для тестирования) ---
const forceErrorMiddleware = (req: any, res: any, next: any) => {
  let hasForceError = false;
  if (req.body || req.params) {
    const str = JSON.stringify(req.body || req.params);
    if (str.indexOf('_force_error_') >= 0) {
      res.status(400);
      res.json({
        code: 'ERROR_FEIGN',
        description: 'Ошибка при взаимодействии с удаленным сервисом',
        externalError: {
          responseCode: '422',
          message: 'Сообщение об ошибке',
          generator: 'TEST',
        },
      });
      hasForceError = true;
    }
  }

  if (!hasForceError) {
    next();
  }
};

// --- Парсер тела запроса (аналог bodyParser в Express) ---
const bodyParserMiddleware = (req: any, res: any, next: any) => {
  if (req.method === 'POST' || req.method === 'PUT') {
    let body = '';
    req.on('data', (chunk: any) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        req.body = JSON.parse(body);
      } catch (e) {
        req.body = {};
      }
      next();
    });
  } else {
    next();
  }
};

// --- Основной конфиг Rsbuild ---
export default defineConfig(() => {
  const isDevMode = process.env.NODE_ENV === 'development';

  return {
    // --- Плагины (type-check отключен в dev для быстрого холодного старта) ---
    plugins: [
      !isDevMode &&
        pluginTypeCheck({
          forkTsCheckerOptions: {
            typescript: {
              memoryLimit: 4096,
            },
          },
        }),
      pluginReact(),
      pluginNodePolyfill(),
      pluginSvgr({
        mixedImport: true,
        svgrOptions: {
          exportType: 'named',
          replaceAttrValues: {
            '#626F84': 'currentColor',
            '#717681': 'currentColor',
          },
        },
      }),
    ].filter(Boolean),

    // --- Настройки сборки ---
    output: {
      sourceMap: {
        js: isDevMode ? 'eval-cheap-source-map' : 'source-map',
      },
      distPath: {
        root: 'build',
      },
      assetPrefix: isDevMode ? '/' : 'auto',
      polyfill: 'usage',
      filename: {
        js: `acrp-app-core-ui-${isDevMode ? '[name].js' : '[name].[contenthash].js'}`,
      },
    },

    // --- Dev-сервер ---
    dev: {
      hmr: true,
      liveReload: true,
      client: {
        overlay: false,
      },
      setupMiddlewares: [
        (middlewares) => {
          if (!isMockMode) {
            return;
          }

          middlewares.unshift(bodyParserMiddleware);
          middlewares.unshift(withDelay(forceErrorMiddleware));

          Object.keys(mockMiddlewares).forEach((key) => {
            middlewares.unshift(withDelay(mockMiddlewares[key]));
          });

          Object.keys(overrideMiddlewares).forEach((key) => {
            middlewares.unshift(withDelay(overrideMiddlewares[key]));
          });
        },
      ],
    },

    // --- Инструменты сборки (Rspack, SWC) ---
    tools: {
      rspack: {
        output: {
          globalObject: 'self',
        },
        plugins: isDevMode
          ? []
          : [
              new rspack.BannerPlugin({
                banner: `/* Версия приложения ${pkg.version} */`,
                raw: true,
              }),
              new rspack.ContextReplacementPlugin(
                /date-fns[/\\]/,
                new RegExp(`[/\\\\](${supportedLocales.join('|')})[/\\\\]index\\.js$`),
              ),
              new rspack.NormalModuleReplacementPlugin(/^lodash$/, 'lodash-es'),
              new rspack.NormalModuleReplacementPlugin(/^lodash\/(.*)$/, (resource) => {
                resource.request = resource.request.replace(/^lodash\//, 'lodash-es/');
              }),
            ],
      },
      swc: {
        jsc: {
          experimental: {
            plugins: [
              [
                '@swc/plugin-styled-components',
                {
                  displayName: true,
                  fileName: false,
                  pure: true,
                  namespace: 'acrp-app-core-ui',
                },
              ],
              ['@effector/swc-plugin', { addLoc: true, addName: true }],
            ],
          },
        },
      },
    },

    // --- Сервер разработки ---
    server: {
      port: 3002,
      strictPort: true,
      historyApiFallback: true,
      open: true,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization',
      },
    },

    // --- HTML-шаблон (title берется напрямую из public/index.html) ---
    html: {
      template: './public/index.html',
      favicon: './public/favicon.ico',
    },

    // --- Оптимизация сборки ---
    performance: {
      chunkSplit: isDevMode
        ? { strategy: 'all-in-one' }
        : { strategy: 'split-by-experience' },
      bundleAnalyze: process.env.BUNDLE_ANALYZE
        ? {
            analyzerMode: 'static',
            openAnalyzer: true,
          }
        : { analyzerMode: 'disabled' },
    },

    // --- Module Federation (только в production) ---
    moduleFederation: isDevMode
      ? undefined
      : {
          options: {
            name: federationConfig.name,
            filename: federationConfig.filename,
            exposes: federationConfig.exposes,
            shared: {
              react: {
                requiredVersion: deps['react'],
                singleton: true,
                eager: true,
              },
              'react-dom': {
                requiredVersion: deps['react-dom'],
                singleton: true,
                eager: true,
              },
              '@vtb-ermo/authorization': {
                requiredVersion: deps['@vtb-ermo/authorization'],
                singleton: true,
                eager: true,
              },
              '@vtb-ermo/notifications': {
                requiredVersion: deps['@vtb-ermo/notifications'],
                singleton: true,
                eager: true,
              },
              'styled-components': {
                requiredVersion: deps['styled-components'],
                singleton: true,
                eager: true,
              },
            },
          },
        },

    // --- Источники (source) ---
    source: {
      entry: {
        index: './src/index.js',
      },
      define: {
        PUBLIC_PATH: '""',
        IS_LOCAL_DEV_ENV: isLocalDevEnv,
        IS_MOCK_MODE: isMockMode,
        IS_WIREMOCK_MODE: isWiremockMode,
        BUILD_VERSION: `'${pkg.name}@${pkg.version}-build.${process.env['BUILD_NUMBER'] || 'unknown'}'`,
        APP_VERSION: `'${pkg.name}@${pkg.version}'`,
        FEATURE_FLAGS: JSON.stringify(mergedFeatureFlags),
      },
    },

    // --- Алиасы ---
    resolve: {
      alias: {
        '~': path.resolve(__dirname, 'src'),
      },
    },
  };
});


