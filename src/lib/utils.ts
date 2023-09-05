export function tryJSONParse(string: string): any {
  try {
    return JSON.parse(string);
  } catch (_) {
    return string;
  }
}
