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
// Используется для имитации сетевой задержки в mock-сервере
const withDelay = (middleware: any, delay = 1000) => {
  return (req: any, res: any, next: any) => {
    setTimeout(() => {
      middleware.middleware(req, res, next);
    }, delay);
  };
};

// --- Middleware для принудительной ошибки (для тестирования) ---
// Если в теле запроса есть '_force_error_', возвращает 400 с фейковой ошибкой
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
// Rsbuild не парсит JSON автоматически — нужно вручную
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
    // --- Плагины ---
    plugins: [
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
    ],

    // --- Настройки сборки ---
    output: {
      sourceMap: {
        js: isDevMode ? 'cheap-module-source-map' : 'source-map',
      },
      distPath: {
        root: 'build',
      },
      // 'auto' в prod решает проблему 502 / ChunkLoadError при загрузке в хост на IFT
      assetPrefix: isDevMode ? '/' : 'auto',
      // Умная подгрузка полифилов вместо дублирования core-js в index.js и remoteEntry.js
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
        plugins: [
          new rspack.BannerPlugin({
            banner: `/* Версия приложения ${pkg.version} */`,
            raw: true,
          }),
          new rspack.ContextReplacementPlugin(
            /date-fns[/\\]/,
            new RegExp(`[/\\\\](${supportedLocales.join('|')})[/\\\\]index\\.js$`),
          ),
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

    // --- HTML-шаблон ---
    html: {
      template: './public/index.html',
      favicon: './public/favicon.ico',
      title: 'ACRP App Core UI',
    },

    // --- Оптимизация сборки ---
    performance: {
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
      transformImport: [
        {
          libraryName: 'lodash',
          customName: 'lodash/{{ member }}',
        },
      ],
    },

    // --- Алиасы ---
    resolve: {
      alias: {
        '~': path.resolve(__dirname, 'src'),
      },
    },
  };
});

//

{
  "name": "acrp-app-core-ui",
  "version": "6.119.0",
  "description": "СУБД Администрирование",
  "main": "index.ts",
  "private": true,
  "scripts": {
    "start": "cross-env NODE_ENV=development TSC_WATCHFILE=UseFsEventsWithFallbackDynamicPolling rsbuild dev",
    "start:mock": "cross-env NODE_ENV=development MOCK_MODE=true TSC_WATCHFILE=UseFsEventsWithFallbackDynamicPolling rsbuild dev",
    "start:wiremock": "cross-env NODE_ENV=development WIREMOCK_MODE=true TSC_WATCHFILE=UseFsEventsWithFallbackDynamicPolling rsbuild dev",
    "build": "cross-env NODE_ENV=production rsbuild build",
    "build:analyze": "cross-env NODE_ENV=production BUNDLE_ANALYZE=true rsbuild build",
    "test": "vitest",
    "coverage": "vitest --coverage",
    "prettify": "prettier --write \"src/**/*.{js|jsx|ts|tsx|json|md}\" \"./**/*.{js|md|json}\"",
    "lint": "eslint --cache ./src --ext .js,.jsx,.ts,.tsx --config .eslintrc.js",
    "lint:fix": "npm run lint -- --fix",
    "lint:strict": "npm run lint -- --config ./.eslintrc.staged.js",
    "prepare": "husky install",
    "type-check": "cross-env TSC_WATCHFILE=UseFsEventsWithFallbackDynamicPolling tsc -p ./tsconfig.json",
    "type-check:watch": "npm run type-check -- --watch",
    "storybook": "start-storybook -p 6006",
    "build-storybook": "build-storybook",
    "serve": "serve dist -p 3002",
    "audit": "npm audit --audit-level=moderate",
    "wiremock": "docker run -it --rm -p 8080:8080 --name wiremock-retail-loan -v %cd%/wiremock:/home/wiremock wiremock/wiremock:2.35.0",
    "wiremock-ui": "docker compose -f ./wiremock-docker-compose.yaml up",
    "changelog": "node scripts/changelog.mjs",
    "wiremock-mac": "docker run -it --rm -p 8080:8080 --name wiremock-retail-loan -v \"$(pwd)/wiremock:/home/wiremock\" wiremock/wiremock:2.35.0",
    "start:wiremock-mac": "cross-env NODE_ENV=development WIREMOCK_MODE=true TSC_WATCHFILE=UseFsEventsWithFallbackDynamicPolling rsbuild dev",
    "e2e": "playwright test",
    "e2e:report": "cross-env E2E_REPORT=true playwright test --reporter html --trace=on && playwright show-report"
  },
  "dependencies": {
    "@admiral-ds/flags": "^3.1.1",
    "@admiral-ds/fonts": "^2.0.0",
    "@admiral-ds/icons": "^4.0.0",
    "@admiral-ds/react-ui": "7.15.0",
    "@emotion/is-prop-valid": "^1.2.1",
    "@maskito/core": "^5.0.0",
    "@maskito/kit": "^5.0.0",
    "@maskito/react": "^5.0.0",
    "@openvtb/admiral-icons": "2.3.3",
    "@openvtb/fonts": "1.0.0",
    "@openvtb/react-ui-kit": "0.5.1",
    "@tanstack/match-sorter-utils": "^8.8.4",
    "@tanstack/react-table": "8.7.9",
    "@tanstack/table-core": "8.7.9",
    "@vtb-ermo/authorization": "^1.5.9",
    "@vtb-ermo/contracts": "1.0.0-rc.3",
    "@vtb-ermo/notifications": "4.0.3",
    "@vtb-ermo/tiny-fp": "2.0.0",
    "@vtb-ermo/utils": "5.0.6",
    "@vtb-rtll-acrp/bff-api": "3.136.0",
    "@vtb-rtll-acrp/notifications": "2.1.1",
    "@vtb-rtll-acrp/shared": "2.15.3",
    "acorn": "8.11.3",
    "axios": "1.18.0",
    "body-scroll-lock": "4.0.0-beta.0",
    "compose-function": "^3.0.3",
    "date-fns": "^2.20.0",
    "date-fns-tz": "^1.1.3",
    "dayjs": "1.11.9",
    "effector": "23.3.0",
    "effector-action": "1.1.3",
    "effector-factorio": "1.3.0",
    "effector-forms": "2.0.0-next.1",
    "effector-inspector": "^0.14.1",
    "effector-logger": "0.15.0",
    "effector-react": "23.3.0",
    "formik": "^2.4.6",
    "js-file-download": "0.4.12",
    "lodash": "4.18.0",
    "nanoid": "3.3.18",
    "new-bff-api-version": "npm:@vtb-rtll-acrp/bff-api@3.196.0",
    "ecm-file-bff-api-version": "npm:@vtb-rtll-acrp/bff-api@3.184",
    "save-file-to-dose-bff-api-version": "npm:@vtb-rtll-acrp/bff-api@3.189",
    "patronum": "2.3.0",
    "react": "17.0.2",
    "react-custom-scrollbars-2": "4.5.0",
    "react-device-detect": "^2.2.3",
    "react-dnd": "^15.0.1",
    "react-dnd-html5-backend": "^15.0.1",
    "react-dom": "17.0.2",
    "react-input-mask": "2.0.4",
    "react-router": "6.28.2",
    "react-router-dom": "6.28.2",
    "react-slotify": "^0.1.7",
    "react-virtual": "2.7.1",
    "react-virtualized": "^9.22.3",
    "styled-components": "6.0.5",
    "styled-system": "5.1.5",
    "transition-list": "0.0.4",
    "yup": "1.2.0"
  },
  "devDependencies": {
    "@babel/core": "^7.29.6",
    "@babel/plugin-transform-runtime": "^7.25.9",
    "@babel/preset-env": "^7.26.0",
    "@babel/preset-react": "^7.26.3",
    "@babel/preset-typescript": "^7.26.0",
    "@commitlint/cli": "17.6.7",
    "@commitlint/config-conventional": "17.6.7",
    "@effector/swc-plugin": "^0.6.0",
    "@feature-sliced/eslint-config": "0.1.0-beta.6",
    "@feature-sliced/eslint-plugin-messages": "0.1.0-beta.2",
    "@fnpen/effector-devtools": "0.4.0",
    "@playwright/test": "^1.65.1",
    "@rsbuild/core": "^1.1.9",
    "@rsbuild/plugin-node-polyfill": "^1.2.0",
    "@rsbuild/plugin-react": "^1.1.0",
    "@rsbuild/plugin-svgr": "^1.0.6",
    "@rsbuild/plugin-type-check": "^1.1.0",
    "@storybook/addon-essentials": "7.6.17",
    "@storybook/addon-links": "7.6.17",
    "@storybook/addon-storysource": "7.6.17",
    "@storybook/builder-webpack5": "7.6.17",
    "@storybook/manager-webpack5": "6.4.18",
    "@storybook/react": "7.6.17",
    "@swc/core": "^1.6.5",
    "@swc/plugin-styled-components": "^5.0.0",
    "@testing-library/jest-dom": "^5.16.5",
    "@testing-library/react": "^12.1.5",
    "@testing-library/user-event": "^13.5.0",
    "@types/compose-function": "^0.0.30",
    "@types/lodash": "^4.14.195",
    "@types/react": "17.0.2",
    "@types/react-dom": "17.0.2",
    "@types/react-input-mask": "^3.0.2",
    "@types/react-router-dom": "5.3.3",
    "@types/react-virtualized": "^9.21.8",
    "@types/styled-components": "5.1.26",
    "@types/styled-system": "5.1.16",
    "@types/yup": "0.29.14",
    "@typescript-eslint/eslint-plugin": "6.8.0",
    "@typescript-eslint/parser": "6.8.0",
    "@vitest/coverage-v8": "^3.2.6",
    "@vitest/runner": "2.1.6",
    "@vitest/ui": "^3.2.6",
    "@wojtekmaj/enzyme-adapter-react-17": "0.8.0",
    "ajv-formats": "2.1.1",
    "babel-plugin-styled-components": "^2.1.4",
    "braces": "3.0.3",
    "commitlint": "17.6.7",
    "core-js": "^3.24.1",
    "cross-env": "7.0.3",
    "dotenv": "16.3.1",
    "dotenv-flow": "3.2.0",
    "enzyme": "^3.11.0",
    "enzyme-to-json": "^3.6.2",
    "esbuild": "0.25.2",
    "eslint": "8.45.0",
    "eslint-config-airbnb": "19.0.4",
    "eslint-config-prettier": "8.8.0",
    "eslint-import-resolver-typescript": "2.7.1",
    "eslint-plugin-boundaries": "3.1.0",
    "eslint-plugin-effector": "0.15.0",
    "eslint-plugin-import": "^2.27.5",
    "eslint-plugin-jest": "27.4.2",
    "eslint-plugin-jsx-a11y": "6.7.1",
    "eslint-plugin-local-rules": "1.3.2",
    "eslint-plugin-prettier": "4.0.0",
    "eslint-plugin-react": "7.33.0",
    "eslint-plugin-react-hooks": "4.6.0",
    "eslint-plugin-testing-library": "5.11.0",
    "husky": "8.0.3",
    "jsdom": "20.0.3",
    "jsonpath-plus": "10.3.0",
    "lint-staged": "13.2.3",
    "micromatch": "4.0.8",
    "nodemon": "3.0.1",
    "prettier": "2.8.8",
    "solid-js": "1.9.4",
    "source-map-explorer": "2.5.3",
    "svgo": "^3.3.4",
    "tsc-files": "^1.1.2",
    "tslib": "2.6.0",
    "type-fest": "^2.19.0",
    "typescript": "5.1.6",
    "vite-plugin-svgr": "^4.3.0",
    "vite-tsconfig-paths": "^5.1.4",
    "vitest": "^3.2.6",
    "webpack-middleware-swagger-faker": "0.0.23"
  },
  "overrides": {
    "@vtb-rtll-acrp/shared": {
      "@admiral-ds/icons": "^4.0.0"
    },
    "axios": "1.18.0",
    "serialize-javascript": "7.0.5",
    "braces": "3.0.3",
    "socket.io-parser": "4.2.7",
    "glob-parent": "5.1.2",
    "js-cookie": "3.0.7",
    "micromatch": "4.0.8"
  }
}

//

    tools: {
      rspack: {
        output: {
          globalObject: 'self',
        },
        plugins: [
          new rspack.BannerPlugin({
            banner: `/* Версия приложения ${pkg.version} */`,
            raw: true,
          }),
          new rspack.ContextReplacementPlugin(
            /date-fns[/\\]/,
            new RegExp(`[/\\\\](${supportedLocales.join('|')})[/\\\\]index\\.js$`),
          ),
          // Подменяет полный lodash на tree-shakeable lodash-es даже внутри node_modules
          new rspack.NormalModuleReplacementPlugin(/^lodash$/, 'lodash-es'),
          new rspack.NormalModuleReplacementPlugin(/^lodash\/(.*)$/, (resource) => {
            resource.request = resource.request.replace(/^lodash\//, 'lodash-es/');
          }),
        ],
      },

