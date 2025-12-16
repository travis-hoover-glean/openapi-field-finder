import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
/**
 * Parses a YAML or JSON file and returns the parsed content.
 *
 * @param filePath - Absolute or relative path to the file
 * @returns Parsed file content as an object
 * @throws Error if file cannot be read or parsed
 *
 * @example
 * // For a JSON file containing: { "name": "test" }
 * const content = await parseFile('config.json')
 * // Returns: { name: 'test' }
 *
 * @example
 * // For a YAML file containing:
 * // paths:
 * //   /users:
 * //     get:
 * //       summary: Get users
 * const content = await parseFile('openapi.yaml')
 * // Returns: { paths: { '/users': { get: { summary: 'Get users' } } } }
 */
const parseFile = async (filePath) => {
    const content = await readFile(filePath, "utf-8");
    const ext = filePath.toLowerCase();
    if (ext.endsWith(".yaml") || ext.endsWith(".yml")) {
        return parseYaml(content);
    }
    return JSON.parse(content);
};
/**
 * Decodes a JSON Pointer segment according to RFC 6901.
 * Handles escape sequences: ~1 → / and ~0 → ~
 * Order matters: ~1 must be decoded before ~0.
 *
 * @param segment - The encoded segment
 * @returns The decoded segment
 *
 * @example
 * decodeJsonPointerSegment('paths')
 * // Returns: 'paths'
 *
 * @example
 * decodeJsonPointerSegment('~1activity')
 * // Returns: '/activity'
 *
 * @example
 * decodeJsonPointerSegment('field~0name')
 * // Returns: 'field~name'
 */
const decodeJsonPointerSegment = (segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~");
/**
 * Resolves a local JSON Reference ($ref) pointer to its target value.
 * Supports local references that start with "#/".
 * Handles JSON Pointer escape sequences (~0 for ~, ~1 for /) per RFC 6901.
 *
 * @param ref - The $ref string (e.g., "#/components/schemas/User")
 * @param rootDocument - The root document to resolve against
 * @returns The resolved value, or undefined if not found
 *
 * @example
 * const doc = {
 *   components: {
 *     schemas: {
 *       User: { type: 'object', properties: { name: { type: 'string' } } }
 *     }
 *   }
 * }
 * const resolved = resolveRef('#/components/schemas/User', doc)
 * // Returns: { type: 'object', properties: { name: { type: 'string' } } }
 *
 * @example
 * // With JSON Pointer escaping (path key contains /)
 * const doc = { paths: { '/users': { get: { summary: 'Get users' } } } }
 * const resolved = resolveRef('#/paths/~1users/get', doc)
 * // Returns: { summary: 'Get users' }
 *
 * @example
 * // For an invalid reference
 * const resolved = resolveRef('#/components/schemas/NotFound', doc)
 * // Returns: undefined
 */
const resolveRef = (ref, rootDocument) => {
    if (!ref.startsWith("#/")) {
        return undefined;
    }
    const pointer = ref.slice(2);
    const segments = pointer.split("/").map(decodeJsonPointerSegment);
    return segments.reduce((current, segment) => {
        if (current === null ||
            current === undefined ||
            typeof current !== "object") {
            return undefined;
        }
        return current[segment];
    }, rootDocument);
};
/**
 * Resolves an external file $ref reference with caching.
 * Handles both file path and JSON pointer parts.
 * Returns both the resolved value and the file context for nested resolution.
 *
 * @param ref - The $ref string (e.g., "./schemas.yaml#/components/User")
 * @param currentFilePath - Path of the current file for relative resolution
 * @param fileCache - Cache of already-loaded files to avoid re-parsing
 * @returns Object containing the resolved value, file path, and root document
 * @throws Error if file cannot be loaded
 *
 * @example
 * // Given ./schemas.yaml contains:
 * // components:
 * //   User:
 * //     type: object
 * const cache = new Map()
 * const result = await resolveExternalRef(
 *   './schemas.yaml#/components/User',
 *   '/project/openapi.yaml',
 *   cache
 * )
 * // Returns: {
 * //   value: { type: 'object' },
 * //   filePath: '/project/schemas.yaml',
 * //   rootDocument: { components: { User: { type: 'object' } } }
 * // }
 *
 * @example
 * // File-only reference (no JSON pointer)
 * const result = await resolveExternalRef(
 *   './common.yaml',
 *   '/project/openapi.yaml',
 *   cache
 * )
 * // Returns: {
 * //   value: <entire parsed contents>,
 * //   filePath: '/project/common.yaml',
 * //   rootDocument: <entire parsed contents>
 * // }
 */
const resolveExternalRef = async (ref, currentFilePath, fileCache) => {
    const hashIndex = ref.indexOf("#");
    const filePath = hashIndex === -1 ? ref : ref.slice(0, hashIndex);
    const jsonPointer = hashIndex === -1 ? null : ref.slice(hashIndex);
    const absolutePath = resolve(dirname(currentFilePath), filePath);
    let doc = fileCache.get(absolutePath);
    if (!doc) {
        doc = await parseFile(absolutePath);
        fileCache.set(absolutePath, doc);
    }
    const value = jsonPointer ? resolveRef(jsonPointer, doc) : doc;
    return {
        filePath: absolutePath,
        rootDocument: doc,
        value,
    };
};
/**
 * Builds a dot-notation path string from an array of path segments.
 * Handles special characters in path segments (like '/activity') and array indices.
 *
 * @param segments - Array of path segments (strings, including numeric strings for array indices)
 * @returns Dot-notation path string
 *
 * @example
 * buildPath(['paths', '/activity', 'x-foo'])
 * // Returns: 'paths./activity.x-foo'
 *
 * @example
 * buildPath(['components', 'schemas', 'User', 'properties', 'name'])
 * // Returns: 'components.schemas.User.properties.name'
 *
 * @example
 * buildPath(['parameters', '0', 'schema'])
 * // Returns: 'parameters.0.schema'
 */
const buildPath = (segments) => segments.join(".");
/**
 * Recursively walks an object tree, following $ref references, and collects
 * all occurrences of a target property.
 *
 * @param obj - The object to walk
 * @param propertyToFind - The property key to search for
 * @param rootDocument - The root document for resolving local $ref references
 * @param currentFilePath - Current file path for resolving external $ref references
 * @param currentPath - Current path segments (for building result keys)
 * @param results - Accumulator for found results
 * @param visited - Set of visited $ref paths to prevent circular references
 * @param fileCache - Cache of loaded external files
 *
 * @example
 * const doc = {
 *   paths: {
 *     '/users': {
 *       'x-foo': { id: '123', message: 'Use /people instead' }
 *     }
 *   }
 * }
 * const results: Record<string, unknown> = {}
 * await walkObject(doc, 'x-foo', doc, '/api.yaml', [], results, new Set(), new Map())
 * // results = {
 * //   'paths./users.x-foo': { id: '123', message: 'Use /people instead' }
 * // }
 *
 * @example
 * // With $ref dereferencing:
 * const doc = {
 *   paths: {
 *     '/users': { $ref: '#/components/pathItems/Users' }
 *   },
 *   components: {
 *     pathItems: {
 *       Users: {
 *         'x-foo': { id: '456', message: 'Deprecated' }
 *       }
 *     }
 *   }
 * }
 * const results: Record<string, unknown> = {}
 * await walkObject(doc, 'x-foo', doc, '/api.yaml', [], results, new Set(), new Map())
 * // results = {
 * //   'paths./users.x-foo': { id: '456', message: 'Deprecated' }
 * // }
 */
const walkObject = async (obj, propertyToFind, rootDocument, currentFilePath, currentPath, results, visited, fileCache) => {
    if (obj === null || obj === undefined || typeof obj !== "object") {
        return;
    }
    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
            await walkObject(obj[i], propertyToFind, rootDocument, currentFilePath, [...currentPath, String(i)], results, visited, fileCache);
        }
        return;
    }
    const record = obj;
    if ("$ref" in record && typeof record.$ref === "string") {
        const ref = record.$ref;
        const visitedKey = ref.startsWith("#")
            ? `${currentFilePath}${ref}`
            : resolve(dirname(currentFilePath), ref);
        if (visited.has(visitedKey)) {
            return;
        }
        visited.add(visitedKey);
        if (ref.startsWith("#")) {
            const resolved = resolveRef(ref, rootDocument);
            if (resolved !== undefined) {
                await walkObject(resolved, propertyToFind, rootDocument, currentFilePath, currentPath, results, visited, fileCache);
            }
        }
        else {
            const externalResult = await resolveExternalRef(ref, currentFilePath, fileCache);
            if (externalResult.value !== undefined) {
                await walkObject(externalResult.value, propertyToFind, externalResult.rootDocument, externalResult.filePath, currentPath, results, visited, fileCache);
            }
        }
        return;
    }
    if (propertyToFind in record) {
        const fullPath = buildPath([...currentPath, propertyToFind]);
        results[fullPath] = record[propertyToFind];
    }
    for (const key of Object.keys(record)) {
        if (key === propertyToFind) {
            continue;
        }
        await walkObject(record[key], propertyToFind, rootDocument, currentFilePath, [...currentPath, key], results, visited, fileCache);
    }
};
/**
 * Searches for all occurrences of a property in YAML/JSON files, following $ref references.
 *
 * @param propertyToFind - The property key to search for
 * @param filePathsToSearch - Array of file paths to search
 * @returns A record where keys are dot-notation paths and values are the property values
 *
 * @example
 * import { find } from './extract'
 *
 * // For a YAML file containing:
 * // paths:
 * //   /foo:
 * //     x-bar:
 * //       message: "Baz"
 *
 * const results = await find('x-bar, ['path/to/foo.yaml'])
 * // Returns:
 * // {
 * //   'paths./foo.x-bar': {
 * //     message: "Baz",
 * //   }
 * // }
 */
export const find = async (propertyToFind, filePathsToSearch) => {
    const results = {};
    const fileCache = new Map();
    for (const filePath of filePathsToSearch) {
        const absolutePath = resolve(filePath);
        const doc = await parseFile(absolutePath);
        fileCache.set(absolutePath, doc);
        await walkObject(doc, propertyToFind, doc, absolutePath, [], results, new Set(), fileCache);
    }
    return results;
};
