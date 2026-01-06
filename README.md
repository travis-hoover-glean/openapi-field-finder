# openapi-field-finder

A library for finding all occurrences of a property in OpenAPI/YAML/JSON files, with full `$ref` resolution support.

## Usage

```typescript
import { find, findWithCallback } from "openapi-field-finder";

// Returns all matches as a record
const results = await find("x-custom-extension", ["./openapi.yaml"]);

// Or use a callback for each match
await findWithCallback("x-custom-extension", ["./openapi.yaml"], (path, content, parent) => {
  console.log(`Found at ${path}:`, content);
});
```

## API

### `find<T>(propertyToFind: string, filePathsToSearch: string[]): Promise<ISearchResult<T>>`

Searches for all occurrences of a property in YAML/JSON files, following `$ref` references.

**Parameters:**
- `propertyToFind` - The property key to search for
- `filePathsToSearch` - Array of file paths to search

**Returns:**
A record where keys are dot-notation paths and values are the property values.

**Type Parameter:**
- `T` - Optional type for the property values (defaults to `unknown`)

### `findWithCallback<T>(propertyToFind: string, filePathsToSearch: string[], callback: FindCallback<T>): Promise<void>`

Searches for all occurrences of a property and invokes a callback for each match.

**Parameters:**
- `propertyToFind` - The property key to search for
- `filePathsToSearch` - Array of file paths to search
- `callback` - Function called for each match: `(path: string, content: T, parent: Record<string, unknown>) => void | Promise<void>`
  - `path` - Dot-notation path to the property (e.g., `paths./users.get.x-custom`)
  - `content` - The value of the found property
  - `parent` - The object containing the found property

**Returns:**
`Promise<void>` - Resolves when all files have been searched and all callbacks have completed.

**Type Parameter:**
- `T` - Optional type for the property values (defaults to `unknown`)

## Examples

### Basic Usage

Given an OpenAPI file `api.yaml`:

```yaml
openapi: 3.0.0
paths:
  /users:
    x-controller: UsersController
    get:
      x-operation-id: listUsers
      summary: List all users
    post:
      x-operation-id: createUser
      summary: Create a user
```

```typescript
import { find } from "openapi-field-finder";

const results = await find("x-operation-id", ["./api.yaml"]);

// Results:
// {
//   "paths./users.get.x-operation-id": "listUsers",
//   "paths./users.post.x-operation-id": "createUser"
// }
```

### With TypeScript Generics

```typescript
interface DeprecationInfo {
  reason: string;
  since: string;
  replacement?: string;
}

const results = await find<DeprecationInfo>("x-deprecated", ["./api.yaml"]);

// TypeScript knows results values are DeprecationInfo
console.log(results["paths./users.x-deprecated"].reason);
```

### Using the Callback API

The callback API is useful when you want to process matches as they're found, or when you need access to the parent object:

```typescript
import { findWithCallback } from "openapi-field-finder";

// Process each match individually
await findWithCallback("x-deprecated", ["./api.yaml"], (path, content, parent) => {
  console.log(`Found deprecated property at: ${path}`);
  console.log(`Reason: ${content.reason}`);
  console.log(`Parent object keys: ${Object.keys(parent).join(", ")}`);
});

// Async callbacks are supported
await findWithCallback("x-custom", ["./api.yaml"], async (path, content) => {
  await saveToDatabase(path, content);
});

// With TypeScript generics
interface CustomExtension {
  enabled: boolean;
  config: Record<string, unknown>;
}

await findWithCallback<CustomExtension>("x-custom", ["./api.yaml"], (path, content) => {
  // TypeScript knows content is CustomExtension
  if (content.enabled) {
    console.log(`Feature enabled at ${path}`);
  }
});
```

### Following Local $ref References

The library automatically follows `$ref` references:

```yaml
paths:
  /users:
    $ref: "#/components/pathItems/Users"
components:
  pathItems:
    Users:
      x-custom:
        message: "Found via ref"
```

```typescript
const results = await find("x-custom", ["./api.yaml"]);

// Results:
// {
//   "paths./users.x-custom": { message: "Found via ref" },
//   "components.pathItems.Users.x-custom": { message: "Found via ref" }
// }
```

### Following External File References

External file references are resolved relative to the current file:

```yaml
# api.yaml
paths:
  /users:
    $ref: "./paths/users.yaml"
```

```yaml
# paths/users.yaml
x-custom:
  message: "From external file"
get:
  summary: Get users
```

```typescript
const results = await find("x-custom", ["./api.yaml"]);

// Results:
// {
//   "paths./users.x-custom": { message: "From external file" }
// }
```

### Searching Multiple Files

```typescript
const results = await find("x-deprecated", [
  "./api-v1.yaml",
  "./api-v2.yaml",
  "./common.yaml",
]);
```

### Working with Arrays

Array indices are included in the path:

```yaml
paths:
  /users:
    get:
      parameters:
        - name: limit
          x-validation:
            max: 100
        - name: offset
          x-validation:
            min: 0
```

```typescript
const results = await find("x-validation", ["./api.yaml"]);

// Results:
// {
//   "paths./users.get.parameters.0.x-validation": { max: 100 },
//   "paths./users.get.parameters.1.x-validation": { min: 0 }
// }
```

## Features

- Parses YAML (`.yaml`, `.yml`) and JSON (`.json`) files
- Follows local `$ref` references (`#/components/...`)
- Follows external file `$ref` references (`./other-file.yaml#/path`)
- Handles JSON Pointer escape sequences (`~0` for `~`, `~1` for `/`)
- Prevents infinite loops from circular references
- Caches external files to avoid re-parsing
- Returns dot-notation paths for easy identification of property locations

## Path Format

Result keys use dot-notation to represent the location of each found property:

| Path | Meaning |
|------|---------|
| `paths./users.get.x-foo` | Property at `paths["/users"]["get"]["x-foo"]` |
| `components.schemas.User.x-bar` | Property at `components["schemas"]["User"]["x-bar"]` |
| `paths./users.get.parameters.0.x-baz` | First parameter's `x-baz` property |

## Development

### Install dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

This compiles TypeScript to `./dist/index.js`.

### Test

```bash
npm run test
```

To run tests in watch mode:

```bash
npm run test:watch
```
