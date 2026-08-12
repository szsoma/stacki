// Cheap, deliberately over-inclusive pattern matching for the kinds of
// secrets a Git diff or a hand-picked project file can carry (spec §19).
// This is a visibility warning, not a security boundary: a match never
// redacts or blocks anything, it only adds a callout so the user sees it in
// the chip's own content before the composed prompt is sent.
const PATTERNS = [
  { name: 'private key', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { name: 'OpenAI API key', re: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: 'bearer token', re: /\bBearer\s+[A-Za-z0-9._-]{20,}\b/ },
  {
    name: 'possible secret assignment',
    re: /\b[A-Z][A-Z0-9_]*(?:SECRET|TOKEN|API_KEY|PASSWORD)[A-Z0-9_]*\s*[:=]\s*['"][^'"\s]{6,}['"]/,
  },
];

/** @param {string} text */
export function scanForSecrets(text) {
  if (!text) return [];
  const hits = [];
  for (const { name, re } of PATTERNS) {
    if (re.test(text)) hits.push(name);
  }
  return hits;
}
