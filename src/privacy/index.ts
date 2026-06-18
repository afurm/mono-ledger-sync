export interface RedactSensitiveTextOptions {
  secrets?: readonly string[];
  replacement?: string;
}

const sensitiveHeaderPattern =
  /\b(X-Token|X-Sign|X-Key-Id|Authorization)\b(\s*[:=]\s*)("[^"]*"|'[^']*'|Bearer\s+[^"\s,;}]+|[^"\s,;}]+)/gi;
const sensitiveJsonFieldPattern =
  /"((?:counter)?Iban|counterEdrpou|counterName|iban|maskedPan|privateKey|privateKeyHex|privateKeyPem|providerPrivateKey|rawJson|payloadJson)"\s*:\s*("[^"]*"|\[[^\]]*\]|\{[^}]*\})/gi;
const ukrainianIbanPattern = /\bUA\d{27}\b/g;
const likelyPanPattern = /\b(?:\d[ -]?){13,19}\b/g;

function redactLiteralSecret(
  value: string,
  secret: string,
  replacement: string,
): string {
  const normalizedSecret = secret.trim();

  if (normalizedSecret.length < 4) {
    return value;
  }

  return value.split(normalizedSecret).join(replacement);
}

export function redactSensitiveText(
  value: string,
  options: RedactSensitiveTextOptions = {},
): string {
  const replacement = options.replacement ?? "[redacted]";
  let redacted = value;

  for (const secret of options.secrets ?? []) {
    redacted = redactLiteralSecret(redacted, secret, replacement);
  }

  return redacted
    .replace(sensitiveHeaderPattern, (_match, header: string, separator) => {
      return `${header}${separator}${replacement}`;
    })
    .replace(sensitiveJsonFieldPattern, (_match, field: string) => {
      return `"${field}":"${replacement}"`;
    })
    .replace(ukrainianIbanPattern, replacement)
    .replace(likelyPanPattern, replacement);
}

export function maskIdentifier(value: string, visible = 4): string {
  const trimmed = value.trim();

  if (trimmed.length <= visible * 2) {
    return "*".repeat(trimmed.length);
  }

  return `${trimmed.slice(0, visible)}...${trimmed.slice(-visible)}`;
}
