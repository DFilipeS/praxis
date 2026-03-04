/**
 * Transforms env var references from ${VAR} to a target format.
 * @param {unknown} value - The value to transform (string, array, object, or primitive).
 * @param {(match: string, varName: string) => string} replacerFn - Regex replacer receiving the full match and the captured variable name.
 */
export function transformEnvVars(value, replacerFn) {
  if (typeof value === "string") {
    return value.replace(/\$\{([^}]+)\}/g, replacerFn);
  }
  if (Array.isArray(value)) {
    return value.map((v) => transformEnvVars(v, replacerFn));
  }
  if (value !== null && typeof value === "object") {
    const result = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = transformEnvVars(v, replacerFn);
    }
    return result;
  }
  return value;
}
