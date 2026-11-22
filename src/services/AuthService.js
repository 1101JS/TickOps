import { api } from './api.js'

// La sesión real vive en una cookie HttpOnly firmada por el servidor; aquí solo se guarda en memoria el usuario actual.
let currentUser = null
let loaded = null

export function loadSession(force = false) {
  if (!loaded || force) {
    loaded = api('/auth/me')
      .then((data) => (currentUser = data.user))
      .catch(() => (currentUser = null))
  }
  return loaded
}

export async function login(correo, password) {
  const data = await api('/auth/login', { method: 'POST', body: { correo, password } })
  currentUser = data.user
  loaded = Promise.resolve(currentUser)
  return currentUser
}

export async function getAuthConfig() {
  return api('/auth/config')
}

export async function register({ nombre, correo, password }) {
  const data = await api('/auth/register', { method: 'POST', body: { nombre, correo, password } })
  return data.user
}

export function isAuthenticated() {
  return Boolean(currentUser)
}

export function getSession() {
  return currentUser
}

export function routeForRole(role) {
  return { admin: 'AdminDashboard', agent: 'AgentDashboard', applicant: 'ApplicantDashboard' }[role] || 'Login'
}

export async function logout() {
  currentUser = null
  loaded = Promise.resolve(null)
  await api('/auth/logout', { method: 'POST' }).catch(() => {})
}
