const SESSION_KEY = 'eticket-session'

const DEMO_ACCOUNTS = {
  admin: { password: 'admin', role: 'admin', displayName: 'Administrador' },
  tecnico: { password: 'tecnico', role: 'technician', displayName: 'Ana López', technicianId: 1 },
  usuario: { password: 'usuario', role: 'applicant', displayName: 'Usuario final' }
}

export function login(username, password) {
  const account = DEMO_ACCOUNTS[username.toLowerCase()]
  if (!account || account.password !== password) return null

  const session = { username: username.toLowerCase(), ...account }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

export function isAuthenticated() {
  return Boolean(getSession())
}

export function getSession() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY))
    return ['admin', 'technician', 'applicant'].includes(session?.role) ? session : null
  } catch {
    return null
  }
}

export function routeForRole(role) {
  return { admin: 'AdminDashboard', technician: 'TechnicianDashboard', applicant: 'ApplicantDashboard' }[role] || 'Login'
}

export function logout() {
  localStorage.removeItem(SESSION_KEY)
}
