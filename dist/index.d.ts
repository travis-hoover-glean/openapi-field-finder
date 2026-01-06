export type ISearchResult<T> = Record<string, T>;
export type FindCallback<T> = (path: string, content: T, parent: Record<string, unknown>) => void | Promise<void>;
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
export declare const find: <T>(propertyToFind: string, filePathsToSearch: string[]) => Promise<ISearchResult<T>>;
/**
 * Searches for all occurrences of a property in YAML/JSON files, following $ref references,
 * and invokes a callback for each match.
 *
 * @param propertyToFind - The property key to search for
 * @param filePathsToSearch - Array of file paths to search
 * @param callback - Async callback invoked for each match with (path, content, parent)
 *
 * @example
 * import { findWithCallback } from './extract'
 *
 * // For a YAML file containing:
 * // paths:
 * //   /foo:
 * //     x-bar:
 * //       message: "Baz"
 *
 * await findWithCallback('x-bar', ['path/to/foo.yaml'], (path, content, parent) => {
 *   console.log(path);    // 'paths./foo.x-bar'
 *   console.log(content); // { message: "Baz" }
 *   console.log(parent);  // { 'x-bar': { message: "Baz" } }
 * });
 */
export declare const findWithCallback: <T>(propertyToFind: string, filePathsToSearch: string[], callback: FindCallback<T>) => Promise<void>;
