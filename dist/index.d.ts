export type ISearchResult<T> = Record<string, T>;
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
