import { createRouter, createWebHistory } from 'vue-router'

import AdminDashboard from '../modules/incidents/views/AdminDashboard.vue'
import AgentDashboard from '../modules/incidents/views/AgentDashboard.vue'
import ApplicantDashboard from '../modules/incidents/views/ApplicantDashboard.vue'
import LoginView from '../modules/auth/LoginView.vue'
import LandingView from '../modules/landing/views/LandingView.vue'
import { getSession, isAuthenticated, loadSession, routeForRole } from '../services/AuthService.js'

const routes = [
  { path: '/', name: 'Landing', component: LandingView },
  { path: '/login', name: 'Login', component: LoginView },
  { path: '/registro', name: 'Register', component: LoginView },
  { path: '/incidencias', name: 'AdminDashboard', component: AdminDashboard, meta: { requiresAuth: true, roles: ['admin'] } },
  { path: '/agente', name: 'AgentDashboard', component: AgentDashboard, meta: { requiresAuth: true, roles: ['agent'] } },
  { path: '/mis-incidencias', name: 'ApplicantDashboard', component: ApplicantDashboard, meta: { requiresAuth: true, roles: ['applicant'] } },
  { path: '/tecnico', redirect: '/agente' }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach(async (to) => {
  // Valida la sesión contra el servidor (cookie HttpOnly) antes de la primera navegación.
  await loadSession()
  const session = getSession()

  if (to.meta.requiresAuth && !isAuthenticated()) {
    return to.name === 'Login' ? undefined : { name: 'Login' }
  }

  if (to.meta.roles && !to.meta.roles.includes(session?.role)) {
    const destination = routeForRole(session?.role)
    return destination === to.name ? undefined : { name: destination }
  }

  if ((to.name === 'Login' || to.name === 'Register') && session) {
    return { name: routeForRole(session.role) }
  }
})

export default router
