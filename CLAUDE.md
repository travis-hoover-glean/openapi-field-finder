# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build      # Compile TypeScript to ./dist/index.js
npm run test       # Run tests once
npm run test:watch # Run tests in watch mode
```

To run a single test:
```bash
npx vitest run -t "test name pattern"
```

## Architecture

This is a single-file library (`index.ts`) that exports one function: `find<T>(propertyToFind, filePathsToSearch)`.

**Core flow:**
1. `find()` - Entry point that iterates through files and calls `walkObject()`
2. `walkObject()` - Recursively traverses objects/arrays, following `$ref` references
3. `resolveRef()` - Resolves local JSON references (`#/components/...`)
4. `resolveExternalRef()` - Resolves external file references with caching

**Key behaviors:**
- Supports YAML (`.yaml`, `.yml`) and JSON files via the `yaml` package
- Follows both local (`#/path`) and external (`./file.yaml#/path`) `$ref` references
- Decodes JSON Pointer escape sequences (`~0` for `~`, `~1` for `/`) per RFC 6901
- Prevents infinite loops from circular references using a visited set
- Returns dot-notation paths (e.g., `paths./users.get.x-foo`)

**Testing:**
Tests use `fixturify-project` to create temporary file fixtures. Each test creates a `Project` instance, writes files to it, runs `find()`, and cleans up in `afterEach`.
