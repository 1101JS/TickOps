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

// ---------- Tokens de sesión firmados (HMAC-SHA256) ----------
// Formato: <payload JSON en base64url>.<firma base64url>. No requiere tabla de sesiones en la base.

function toBase64Url(bytes) {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text) {
  const normal = text.replace(/-/g, '+').replace(/_/g, '/')
  return fromBase64(normal + '='.repeat((4 - (normal.length % 4)) % 4))
}

const hmacKeys = new Map()
function hmacKey(secret) {
  if (!hmacKeys.has(secret)) {
    hmacKeys.set(secret, crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']))
  }
  return hmacKeys.get(secret)
}

export async function signToken(payload, secret) {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)))
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(body))
  return `${body}.${toBase64Url(signature)}`
}

// Devuelve el payload si la firma es válida; si no, null. (crypto.subtle.verify compara en tiempo constante.)
export async function verifyToken(token, secret) {
  const [body, signature, extra] = String(token || '').split('.')
  if (!body || !signature || extra !== undefined) return null
  try {
    const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromBase64Url(signature), encoder.encode(body))
    return valid ? JSON.parse(new TextDecoder().decode(fromBase64Url(body))) : null
  } catch {
    return null
  }
}

export function randomToken() {
  return toBase64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
