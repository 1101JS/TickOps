import { api } from './api.js'

// La sesión real vive en una cookie HttpOnly; aquí solo se guarda en memoria el usuario actual.
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

export async function login(username, password) {
  const data = await api('/auth/login', { method: 'POST', body: { username, password } })
  currentUser = data.user
  loaded = Promise.resolve(currentUser)
  return currentUser
}

export async function register({ name, username, email, password }) {
  const data = await api('/auth/register', { method: 'POST', body: { name, username, email, password } })
  return data.user
}

export function isAuthenticated() {
  return Boolean(currentUser)
}

export function getSession() {
  return currentUser
}

export function routeForRole(role) {
  return { admin: 'AdminDashboard', technician: 'TechnicianDashboard', applicant: 'ApplicantDashboard' }[role] || 'Login'
}

export async function logout() {
  currentUser = null
  loaded = Promise.resolve(null)
  await api('/auth/logout', { method: 'POST' }).catch(() => {})
}
