// Utilidades criptográficas basadas en Web Crypto (funcionan igual en Cloudflare Workers y Node 24).
const encoder = new TextEncoder()

function toBase64(bytes) {
  let binary = ''
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(text) {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0))
}

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256))
}

// Formato almacenado: pbkdf2_sha256$<iteraciones>$<salt b64>$<hash b64>
export async function hashPassword(password, iterations = 100000) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(password, salt, iterations)
  return `pbkdf2_sha256$${iterations}$${toBase64(salt)}$${toBase64(hash)}`
}

export async function verifyPassword(password, stored) {
  const [algorithm, iterations, salt, hash] = String(stored || '').split('$')
  if (algorithm !== 'pbkdf2_sha256' || !iterations || !salt || !hash) return false
  const actual = await derive(password, fromBase64(salt), Number(iterations))
  const expected = fromBase64(hash)
  if (actual.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i]
  return diff === 0
}

export function randomToken() {
  return toBase64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
