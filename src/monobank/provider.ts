import { createHash, createHmac } from "node:crypto";

import * as secp256k1 from "@noble/secp256k1";

const textEncoder = new TextEncoder();

secp256k1.hashes.sha256 = (message) => {
  return createHash("sha256").update(message).digest();
};
secp256k1.hashes.hmacSha256 = (key, ...messages) => {
  const hmac = createHmac("sha256", key);

  for (const message of messages) {
    hmac.update(message);
  }

  return hmac.digest();
};

export interface MonobankProviderSignaturePayloadInput {
  time: string | number;
  url: string;
  requestId?: string;
}

export interface MonobankProviderSigningInput extends MonobankProviderSignaturePayloadInput {
  privateKeyHex: string;
}

export interface MonobankProviderSignedHeadersInput extends MonobankProviderSigningInput {
  keyId?: string;
}

export interface MonobankProviderSignedHeaders {
  "X-Time": string;
  "X-Sign": string;
  "X-Request-Id"?: string;
  "X-Key-Id"?: string;
}

export interface MonobankProviderSignatureVerificationInput extends MonobankProviderSignaturePayloadInput {
  publicKeyHex: string;
  signatureBase64: string;
}

function normalizeHexKey(value: string, label: string): Uint8Array {
  const normalized = value.trim().replace(/^0x/i, "").toLowerCase();

  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error(`${label} must be a hex-encoded secp256k1 key`);
  }

  return Uint8Array.from(Buffer.from(normalized, "hex"));
}

function normalizePrivateKey(value: string): Uint8Array {
  const key = normalizeHexKey(value, "privateKeyHex");

  if (key.length !== 32) {
    throw new Error("privateKeyHex must be 32 bytes");
  }

  secp256k1.getPublicKey(key);

  return key;
}

function normalizePublicKey(value: string): Uint8Array {
  const key = normalizeHexKey(value, "publicKeyHex");

  if (key.length !== 33 && key.length !== 65) {
    throw new Error("publicKeyHex must be a compressed or uncompressed key");
  }

  return key;
}

function normalizeProviderUrl(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("url must be a non-empty string");
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const parsed = new URL(trimmed);

    return `${parsed.pathname}${parsed.search}`;
  }

  if (!trimmed.startsWith("/")) {
    throw new Error("url must be a path or absolute http(s) URL");
  }

  return trimmed;
}

export function createMonobankProviderSignaturePayload(
  input: MonobankProviderSignaturePayloadInput,
): string {
  const time = String(input.time).trim();

  if (!/^\d+$/.test(time)) {
    throw new Error("time must be a Unix timestamp string or number");
  }

  const parts = [time];

  if (input.requestId !== undefined && input.requestId.trim() !== "") {
    parts.push(input.requestId.trim());
  }

  parts.push(normalizeProviderUrl(input.url));

  return parts.join("|");
}

export function getMonobankProviderPublicKeyHex(privateKeyHex: string): string {
  return Buffer.from(
    secp256k1.getPublicKey(normalizePrivateKey(privateKeyHex), false),
  ).toString("hex");
}

export function signMonobankProviderRequest(
  input: MonobankProviderSigningInput,
): string {
  const payload = createMonobankProviderSignaturePayload(input);
  const signature = secp256k1.sign(
    textEncoder.encode(payload),
    normalizePrivateKey(input.privateKeyHex),
  );

  return Buffer.from(signature).toString("base64");
}

export function verifyMonobankProviderSignature(
  input: MonobankProviderSignatureVerificationInput,
): boolean {
  const signature = Buffer.from(input.signatureBase64, "base64");

  if (signature.length !== 64) {
    return false;
  }

  return secp256k1.verify(
    Uint8Array.from(signature),
    textEncoder.encode(createMonobankProviderSignaturePayload(input)),
    normalizePublicKey(input.publicKeyHex),
  );
}

export function createMonobankProviderSignedHeaders(
  input: MonobankProviderSignedHeadersInput,
): MonobankProviderSignedHeaders {
  const headers: MonobankProviderSignedHeaders = {
    "X-Time": String(input.time),
    "X-Sign": signMonobankProviderRequest(input),
  };

  if (input.requestId !== undefined && input.requestId.trim() !== "") {
    headers["X-Request-Id"] = input.requestId.trim();
  }

  if (input.keyId !== undefined && input.keyId.trim() !== "") {
    headers["X-Key-Id"] = input.keyId.trim();
  }

  return headers;
}
