// WebCrypto AES-GCM + PBKDF2 + XOR-demo (browser-only)
// AES: CFS1 container
// XOR demo: XOR2 container (keystream via SHA-256 + auth tag) -> wrong code => error

const enc = new TextEncoder();

/* =========================
   Helpers
   ========================= */
function u8concat(...parts: Uint8Array[]) {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function toU32LE(n: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  b[2] = (n >>> 16) & 0xff;
  b[3] = (n >>> 24) & 0xff;
  return b;
}

function fromU32LE(b: Uint8Array): number {
  return (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0;
}

function randBytes(len: number): Uint8Array {
  const a = new Uint8Array(len);
  globalThis.crypto.getRandomValues(a);
  return a;
}

function assertCode(passphrase: string) {
  const p = passphrase.trim();
  if (p.length < 6) throw new Error("Код занадто короткий (мін. 6 символів).");
  return p;
}

function u8eq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a[i] ^ b[i];
  return x === 0;
}

/* =========================
   PBKDF2 -> AES-GCM
   ========================= */
async function deriveAesKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array,
  iterations = 200_000
) {
  const subtle = globalThis.crypto.subtle;

  const baseKey = await subtle.importKey(
    "raw",
    enc.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: { name: "SHA-256" },
      salt,
      iterations,
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/* =========================
   AES container: CFS1
   =========================
   [4 bytes "CFS1"]
   [4 bytes saltLen LE][salt]
   [4 bytes ivLen   LE][iv]
   [ciphertext...]
*/
const MAGIC_CFS = enc.encode("CFS1");

export async function encryptFileAesGcm(file: File, passphrase: string): Promise<Blob> {
  const p = assertCode(passphrase);
  if (file.size === 0) throw new Error("Файл порожній.");

  const subtle = globalThis.crypto.subtle;

  const plain = new Uint8Array(await file.arrayBuffer());
  const salt = randBytes(16);
  const iv = randBytes(12);

  const key = await deriveAesKeyFromPassphrase(p, salt);

  const cipherBuf = await subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  const cipher = new Uint8Array(cipherBuf);

  const header = u8concat(
    MAGIC_CFS,
    toU32LE(salt.length),
    salt,
    toU32LE(iv.length),
    iv
  );

  return new Blob([header, cipher], { type: "application/octet-stream" });
}

export async function decryptFileAesGcm(file: File, passphrase: string): Promise<Blob> {
  const p = assertCode(passphrase);
  if (file.size === 0) throw new Error("Файл порожній або пошкоджений.");

  const subtle = globalThis.crypto.subtle;
  const data = new Uint8Array(await file.arrayBuffer());

  if (data.length < 4) throw new Error("Невірний формат контейнера.");
  const magic = data.slice(0, 4);
  if (
    magic[0] !== MAGIC_CFS[0] ||
    magic[1] !== MAGIC_CFS[1] ||
    magic[2] !== MAGIC_CFS[2] ||
    magic[3] !== MAGIC_CFS[3]
  ) {
    throw new Error("Невірний формат: очікується контейнер CFS1 (.cfs).");
  }

  let off = 4;

  if (data.length < off + 4) throw new Error("Пошкоджений контейнер (saltLen).");
  const saltLen = fromU32LE(data.slice(off, off + 4));
  off += 4;

  if (data.length < off + saltLen) throw new Error("Пошкоджений контейнер (salt).");
  const salt = data.slice(off, off + saltLen);
  off += saltLen;

  if (data.length < off + 4) throw new Error("Пошкоджений контейнер (ivLen).");
  const ivLen = fromU32LE(data.slice(off, off + 4));
  off += 4;

  if (data.length < off + ivLen) throw new Error("Пошкоджений контейнер (iv).");
  const iv = data.slice(off, off + ivLen);
  off += ivLen;

  const cipher = data.slice(off);
  const key = await deriveAesKeyFromPassphrase(p, salt);

  try {
    const plainBuf = await subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
    return new Blob([plainBuf], { type: "application/octet-stream" });
  } catch {
    throw new Error("Не вдалося дешифрувати: неправильний код або файл пошкоджений.");
  }
}

/* =========================
   XOR demo container: XOR2 (DEMO ONLY)
   =========================
   XOR2:
   [4 bytes "XOR2"]
   [4 bytes saltLen LE][salt]
   [16 bytes tag]   // first 16 bytes of SHA-256("XOR2"+salt+cipher+code)
   [ciphertext...]
   Where cipher = plain XOR keystream, keystream blocks:
     KS_i = SHA-256(code + salt + u32le(i))  (32 bytes)
   Wrong code => tag mismatch => error
*/
const MAGIC_XOR2 = enc.encode("XOR2");

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(buf);
}

function u32leBytes(i: number): Uint8Array {
  return toU32LE(i >>> 0);
}

async function xor2KeystreamXor(data: Uint8Array, code: string, salt: Uint8Array): Promise<Uint8Array> {
  const c = enc.encode(code);
  const out = new Uint8Array(data.length);

  // 32 bytes per block (SHA-256)
  const blockSize = 32;
  let counter = 0;

  for (let off = 0; off < data.length; off += blockSize) {
    const chunkLen = Math.min(blockSize, data.length - off);

    const ksInput = u8concat(c, salt, u32leBytes(counter));
    const ks = await sha256(ksInput); // 32 bytes
    for (let i = 0; i < chunkLen; i++) {
      out[off + i] = data[off + i] ^ ks[i];
    }

    counter++;
  }

  return out;
}

async function xor2Tag(cipher: Uint8Array, code: string, salt: Uint8Array): Promise<Uint8Array> {
  const c = enc.encode(code);
  const full = await sha256(u8concat(MAGIC_XOR2, salt, cipher, c));
  return full.slice(0, 16);
}

export async function encryptFileXorDemo(file: File, passphrase: string): Promise<Blob> {
  const p = assertCode(passphrase);
  if (file.size === 0) throw new Error("Файл порожній.");

  const plain = new Uint8Array(await file.arrayBuffer());
  const salt = randBytes(16);

  const cipher = await xor2KeystreamXor(plain, p, salt);
  const tag = await xor2Tag(cipher, p, salt);

  const header = u8concat(
    MAGIC_XOR2,
    toU32LE(salt.length),
    salt,
    tag
  );

  return new Blob([header, cipher], { type: "application/octet-stream" });
}

export async function decryptFileXorDemo(file: File, passphrase: string): Promise<Blob> {
  const p = assertCode(passphrase);
  if (file.size === 0) throw new Error("Файл порожній або пошкоджений.");

  const data = new Uint8Array(await file.arrayBuffer());
  if (data.length < 4) throw new Error("Невірний формат XOR контейнера.");

  const magic = data.slice(0, 4);

  // ===== XOR2 (new) =====
  if (
    magic[0] === MAGIC_XOR2[0] &&
    magic[1] === MAGIC_XOR2[1] &&
    magic[2] === MAGIC_XOR2[2] &&
    magic[3] === MAGIC_XOR2[3]
  ) {
    let off = 4;

    if (data.length < off + 4) throw new Error("Пошкоджений XOR2 (saltLen).");
    const saltLen = fromU32LE(data.slice(off, off + 4));
    off += 4;

    if (saltLen < 8 || saltLen > 1024) throw new Error("Пошкоджений XOR2 (saltLen некоректний).");
    if (data.length < off + saltLen + 16) throw new Error("Пошкоджений XOR2 (salt/tag).");

    const salt = data.slice(off, off + saltLen);
    off += saltLen;

    const tagInFile = data.slice(off, off + 16);
    off += 16;

    const cipher = data.slice(off);
    if (cipher.length === 0) throw new Error("Пошкоджений XOR2 (немає ciphertext).");

    const expected = await xor2Tag(cipher, p, salt);
    if (!u8eq(tagInFile, expected)) {
      throw new Error("Неправильний код для XOR (demo) або файл пошкоджений/змінений.");
    }

    const plain = await xor2KeystreamXor(cipher, p, salt);
    return new Blob([plain], { type: "application/octet-stream" });
  }

  // ===== XOR1 (legacy fallback) =====
  // старий формат:
  // [4 bytes "XOR1"][1 byte keyByte][cipher...]
  const MAGIC_XOR1 = enc.encode("XOR1");
  if (
    magic[0] === MAGIC_XOR1[0] &&
    magic[1] === MAGIC_XOR1[1] &&
    magic[2] === MAGIC_XOR1[2] &&
    magic[3] === MAGIC_XOR1[3]
  ) {
    if (data.length < 5) throw new Error("Невірний формат XOR1 контейнера.");

    const keyByteInFile = data[4];

    // legacy keyByte from code (колізії можливі, це DEMO)
    const c = p.trim();
    const a = c.charCodeAt(0) & 0xff;
    const b = c.charCodeAt(c.length - 1) & 0xff;
    const keyByteFromCode = (a ^ b) & 0xff;

    if (keyByteFromCode !== keyByteInFile) {
      throw new Error("Неправильний код для XOR (demo).");
    }

    const cipher = data.slice(5);
    const out = new Uint8Array(cipher.length);
    for (let i = 0; i < cipher.length; i++) out[i] = cipher[i] ^ keyByteInFile;

    return new Blob([out], { type: "application/octet-stream" });
  }

  throw new Error("Невірний формат: очікується XOR2/XOR1 (.xor).");
}

/* =========================
   Download helper
   ========================= */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
