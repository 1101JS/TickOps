
import { createRouter, createWebHistory } from 'vue-router'
import ApplicantDashboard from '../modules/incidents/views/ApplicantDashboard.vue'
import LoginView from '../modules/auth/LoginView.vue'

const routes = [
  {
    path: '/',
    redirect: '/login'
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
}
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
