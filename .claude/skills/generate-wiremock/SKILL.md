---
name: generate-wiremock
description: Generate a WireMock stub directory (mappings + __files) from an OpenAPI/Swagger YAML spec via generate-wiremock.js. Use when asked to create/refresh WireMock mocks/stubs from an API schema, regenerate mocks after the schema changes, or explain how the mocks were produced.
---

# generate-wiremock

Turns an OpenAPI/Swagger 3.x YAML file into a ready-to-use WireMock stub directory.
The logic lives entirely in [generate-wiremock.js](../../../generate-wiremock.js) at the repo root — read that file for exact behavior before changing it.

## Running it

```bash
npm install                     # first time only: @apidevtools/swagger-parser, fs-extra
npm run generate                 # uses ./schema.yaml, writes ./wiremock
npm run generate -- <schemaDir> <outDir>   # explicit schema directory / output directory
```

- Arg 1 is a **directory** that must contain a file literally named `schema.yaml` (not a path to the file itself). Defaults to `process.cwd()`.
- Arg 2 is the output directory. Defaults to `<schemaDir>/wiremock`.
- The script hard-fails with a clear error if `schema.yaml` isn't found at `<schemaDir>/schema.yaml`.

## What it produces

```
wiremock/
  mappings/   one <method>_<slugified-path>.json per operation (request matcher + response)
  __files/    one <method>_<slugified-path>-response.json per operation that has a JSON body
```

`wiremock/mappings` and `wiremock/__files` are emptied (`fs.emptyDirSync`) at the start of every run — full regeneration, not incremental. Nothing outside those two folders is touched.

## Key behavior to know before touching the script

- Parses via `SwaggerParser.dereference()` with `circular: 'ignore'`, so every `$ref` (schemas, examples) is resolved into plain objects before generation logic runs. Circular schemas are guarded separately in `generateMock` via a recursion-path `seen` set plus a hard `MAX_DEPTH` (6).
- Per operation, only **one** response is turned into a mock: first `2xx` found, else `default`, else whatever key exists first. Multi-status mocking (e.g. also emitting a 404 variant) is not implemented — if asked for that, it's a new feature, not a bug fix.
- Body content type: prefers `application/json`; otherwise falls back to the first content type present. Non-JSON bodies still get a mock file written via `fs.writeJsonSync`, which will be wrong for genuinely binary/non-JSON media types — flag this if the target spec has such responses.
- Body value priority: explicit `example` → first entry of `examples` → schema-driven synthesis (`generateMock`/`mockString`). `allOf` is merged, `oneOf`/`anyOf` just take the first branch — not a full combinatorial expansion.
- Path params (`{owner}`) become a regex `urlPathPattern` (`[^/]+` per segment); paths without params use plain `urlPath`. Query and header parameters are ignored entirely — mappings match on method + path only.
- Filenames come from `slugify(path, method)` (e.g. `get_repos_owner_repo_issues`); collisions are disambiguated with a numeric suffix via `uniqueSlug`.

## Extending

Common asks and where they'd land:
- More realistic fake data per field name → extend `mockString`/`generateMock`.
- Multiple response variants (status codes, scenarios) per endpoint → rework the single-response assumption in `resolveResponse` and the main loop in `main()`.
- Matching query/header params → extend `buildRequest`.

## Verifying after a change

Regenerate against the repo's own `schema.yaml` (a full real-world spec, good stress test for `$ref`/`allOf`) and sanity check output:

```bash
npm run generate
find wiremock -maxdepth 1 -type d          # must be exactly mappings/ and __files/
node -e '
  const fs=require("fs-extra"), path=require("path");
  for (const dir of ["wiremock/mappings","wiremock/__files"])
    for (const f of fs.readdirSync(dir)) JSON.parse(fs.readFileSync(path.join(dir,f)));
  console.log("all JSON valid");
'
```
