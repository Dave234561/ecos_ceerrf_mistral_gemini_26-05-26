import crypto, { type BinaryLike } from "node:crypto";

type HashLike = typeof crypto & {
  hash?: (algorithm: string, data: BinaryLike, outputEncoding?: crypto.BinaryToTextEncoding) => string | Buffer;
};

function normalizeInput(data: BinaryLike | ArrayBuffer | SharedArrayBuffer): BinaryLike {
  if (typeof data === "string" || Buffer.isBuffer(data)) {
    return data;
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }

  if (data instanceof ArrayBuffer || data instanceof SharedArrayBuffer) {
    return Buffer.from(data);
  }

  throw new TypeError("Unsupported data type for crypto.hash polyfill");
}

export function ensureCryptoHashPolyfill(): void {
  const nodeCrypto = crypto as HashLike;

  if (typeof nodeCrypto.hash === "function") {
    return;
  }

  nodeCrypto.hash = (algorithm: string, data: BinaryLike | ArrayBuffer | SharedArrayBuffer, outputEncoding?: crypto.BinaryToTextEncoding) => {
    const hash = crypto.createHash(algorithm);
    hash.update(normalizeInput(data));
    return outputEncoding ? hash.digest(outputEncoding) : hash.digest();
  };
}

ensureCryptoHashPolyfill();
