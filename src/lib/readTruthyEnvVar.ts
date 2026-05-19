/** true | 1 | yes | y | on | oui (insensible à la casse). */
export function readTruthyEnvVar(name: string): boolean {
  let raw = process.env[name]?.trim() ?? "";
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1).trim();
  }
  const v = raw.toLowerCase();
  if (!v) return false;
  return v === "1" || v === "true" || v === "yes" || v === "y" || v === "on" || v === "oui";
}
