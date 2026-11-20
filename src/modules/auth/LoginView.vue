<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import './LoginView.css'
import { login, routeForRole } from '../../services/AuthService.js'

const route = useRoute()
const router = useRouter()
const username = ref('')
const password = ref('')
const error = ref('')
const isRegister = computed(() => route.name === 'Register')

async function handleLogin() {
  error.value = ''
  try {
    const session = await login(username.value.trim(), password.value)
    router.push({ name: routeForRole(session.role) })
  } catch (err) {
    error.value = err.message || 'Usuario o contraseña incorrectos.'
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-card">
      <div class="login-brand">
        <div class="login-logo">E</div>
        <h1>TickOps</h1>
        <p>Sistema de Gestión de Incidencias</p>
      </div>

      <div class="login-heading">
        <h2>{{ isRegister ? 'Acceso de demostración' : 'Bienvenido' }}</h2>
        <p v-if="isRegister">El registro de cuentas estará disponible cuando conectemos el backend.</p>
        <p v-else>Ingresa tus credenciales para continuar.</p>
      </div>

      <div v-if="isRegister" class="demo-access">
        <p>El registro de cuentas aún no está habilitado.</p>
        <RouterLink to="/login" class="login-button access-link">Ir a iniciar sesión</RouterLink>
      </div>

      <form v-else class="login-form" @submit.prevent="handleLogin">
        <div class="form-group">
          <label for="username">Usuario</label>
          <input id="username" v-model="username" type="text" placeholder="admin" autocomplete="username" required />
        </div>

        <div class="form-group">
          <label for="password">Contraseña</label>
          <input id="password" v-model="password" type="password" placeholder="Ingresa tu contraseña" autocomplete="current-password" required />
        </div>

        <p v-if="error" class="login-error" role="alert">{{ error }}</p>
        <button type="submit" class="login-button">Iniciar sesión</button>
        <p class="demo-accounts">Demo: <strong>admin/admin</strong>, <strong>tecnico/tecnico</strong> o <strong>usuario/usuario</strong>.</p>
      </form>

      <footer class="login-footer"><p>UTH · Sistema de Soporte Técnico</p></footer>
    </section>
  </main>
</template>

<style scoped>
.login-error{margin:0;color:#b42318;font-size:13px;line-height:1.5}.demo-accounts{margin:0;color:#64748b;font-size:11px;line-height:1.6}.demo-access{display:flex;flex-direction:column;gap:10px;padding:16px;border-radius:10px;background:#f1f5f9;color:#334155;font-size:14px}.demo-access p{margin:0 0 4px;line-height:1.5}.access-link{margin-top:8px;text-align:center;text-decoration:none}
</style>
