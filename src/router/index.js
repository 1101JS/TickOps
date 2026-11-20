import { createRouter, createWebHistory } from 'vue-router'

import AdminDashboard from '../modules/incidents/views/AdminDashboard.vue'
import TechnicianDashboard from '../modules/incidents/views/TechnicianDashboard.vue'
import ApplicantDashboard from '../modules/incidents/views/ApplicantDashboard.vue'
import UsersView from '../modules/admin/UsersView.vue'
import IncidentHistory from '../modules/incidents/views/IncidentHistory.vue'
import LoginView from '../modules/auth/LoginView.vue'
import LandingView from '../modules/landing/views/LandingView.vue'
import { getSession, isAuthenticated, routeForRole } from '../services/AuthService.js'

const routes = [
  {
    path: '/',
    name: 'Landing',
    component: LandingView
  },
  {
    path: '/login',
    name: 'Login',
    component: LoginView
  },
  {
    path: '/incidencias',
    name: 'AdminDashboard',
    component: AdminDashboard,
    meta: { requiresAuth: true, roles: ['admin'] }
  },
  {
    path: '/usuarios',
    name: 'UsersView',
    component: UsersView,
    meta: { requiresAuth: true, roles: ['admin'] }
  },
  {
    path: '/tecnico',
    name: 'TechnicianDashboard',
    component: TechnicianDashboard,
    meta: { requiresAuth: true, roles: ['technician'] }
  },
  {
    path: '/mis-incidencias',
    name: 'ApplicantDashboard',
    component: ApplicantDashboard,
    meta: { requiresAuth: true, roles: ['applicant'] }
  },
  {
    path: '/historial',
    name: 'IncidentHistory',
    component: IncidentHistory,
    meta: { requiresAuth: true, roles: ['admin', 'technician', 'applicant'] }
  },
  {
    path: '/registro',
    name: 'Register',
    component: LoginView
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to) => {
  const session = getSession()

  if (to.meta.requiresAuth && !isAuthenticated()) {
    return to.name === 'Login' ? undefined : { name: 'Login' }
  }

  if (to.meta.roles && !to.meta.roles.includes(session?.role)) {
    const destination = routeForRole(session?.role)
    return destination === to.name ? undefined : { name: destination }
  }

  if (to.name === 'Login' && session) {
    const destination = routeForRole(session.role)
    return destination === to.name ? undefined : { name: destination }
  }
})

export default router