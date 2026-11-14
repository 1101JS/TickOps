
import { createRouter, createWebHistory } from 'vue-router'

import ApplicantDashboard from '../modules/incidents/views/ApplicantDashboard.vue'
import LoginView from '../modules/auth/LoginView.vue'
import LandingView from '../modules/landing/views/LandingView.vue'

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
    name: 'ApplicantDashboard',
    component: ApplicantDashboard
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

export default router
