# Генератор WireMock-моков из OpenAPI/Swagger

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

  dev: {
    hmr: true,
    liveReload: true,
  },

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

  moduleFederation: isDevMode
    ? undefined
    : {
        options: {
          name: federationConfig.name,
          filename: federationConfig.filename,
          exposes: federationConfig.exposes,
          shared: {
            react: { singleton: true, eager: true, requiredVersion: deps.react },
            'react-dom': { singleton: true, eager: true, requiredVersion: deps['react-dom'] },
            '@vtb-ermo/authorization': { singleton: true, eager: true, requiredVersion: deps['@vtb-ermo/authorization'] },
            '@vtb-ermo/notifications': { singleton: true, eager: true, requiredVersion: deps['@vtb-ermo/notifications'] },
            'styled-components': { singleton: true, eager: true, requiredVersion: deps['styled-components'] },
          },
        },
      },

  tools: {
    rspack: {
      output: { globalObject: 'self' },
      plugins: [
        new rspack.BannerPlugin({
          banner: `/* Версия приложения ${pkg.version} */`,
          raw: true,
        }),
        new rspack.ContextReplacementPlugin(/date-fns[/\\]/, (context) => {
          context.regExp = /^\.\/(en-US|ru)$/;
        }),
      ],
    },
    swc: {
      jsc: {
        experimental: {
          plugins: [
            ['@swc/plugin-styled-components', {}],
            ['@effector/swc-plugin', { namespace: 'acrp-app-core-ui' }],
          ],
        },
      },
    },
  },
});


//

"@rsbuild/core": "^1.1.9",
"@rsbuild/plugin-node-polyfill": "^1.2.0",
"@rsbuild/plugin-react": "^1.1.0",
"@rsbuild/plugin-svgr": "^1.0.6",
"@rsbuild/plugin-type-check": "^1.1.0",
"@swc/plugin-styled-components": "^5.0.0",
"@effector/swc-plugin": "^0.6.0"

//

npm uninstall webpack webpack-cli webpack-dev-server webpack-dev-middleware webpack-merge webpack-bundle-analyzer webpack-manifest-plugin html-webpack-plugin clean-webpack-plugin copy-webpack-plugin mini-css-extract-plugin terser-webpack-plugin fork-ts-checker-webpack-plugin dotenv-webpack css-loader style-loader sass-loader file-loader url-loader @svgr/webpack vite @originjs/vite-plugin-federation vite-plugin-svgr vite-tsconfig-paths @babel/preset-env @babel/preset-react @babel/preset-typescript @babel/runtime @babel/runtime-corejs3 @babel/traverse babel-loader babel-plugin-macros babel-plugin-styled-components babel-polyfill babel-preset-react-app


//



