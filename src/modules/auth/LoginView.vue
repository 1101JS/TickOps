<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import './LoginView.css'
import ThemeSwitcher from '../../components/ThemeSwitcher.vue'
import { getAuthConfig, login, register, routeForRole } from '../../services/AuthService.js'

const route = useRoute()
const router = useRouter()
const nombre = ref('')
const correo = ref('')
const password = ref('')
const error = ref('')
const notice = ref('')
const sending = ref(false)
const allowRegistration = ref(false)
const isRegister = computed(() => route.name === 'Register')

async function handleLogin() {
  if (sending.value) return
  sending.value = true
  error.value = ''
  try {
    const session = await login(correo.value.trim(), password.value)
    router.push({ name: routeForRole(session.role) })
  } catch (err) {
    error.value = err.message || 'Correo o contraseña incorrectos.'
  } finally {
    sending.value = false
  }
}

async function handleRegister() {
  if (sending.value) return
  sending.value = true
  error.value = ''
  try {
    await register({ nombre: nombre.value.trim(), correo: correo.value.trim(), password: password.value })
    password.value = ''
    notice.value = 'Cuenta creada. Ya puedes iniciar sesión.'
    router.push({ name: 'Login' })
  } catch (err) {
    error.value = err.message
  } finally {
    sending.value = false
  }
}

onMounted(async () => {
  allowRegistration.value = (await getAuthConfig().catch(() => ({}))).allowRegistration === true
})
</script>

<template>
  <main class="login-page">
    <div class="login-theme"><ThemeSwitcher /></div>
    <section class="login-card">
      <div class="login-brand">
        <div class="login-logo">E</div>
        <h1>TickOps</h1>
        <p>Sistema de Gestión de Incidencias</p>
      </div>

      <div class="login-heading">
        <h2>{{ isRegister ? 'Crear cuenta' : 'Bienvenido' }}</h2>
        <p v-if="!isRegister">Ingresa con tu correo institucional.</p>
      </div>

      <div v-if="isRegister && !allowRegistration" class="demo-access">
        <p>Las cuentas las crea el administrador del sistema. Solicita la tuya a tu departamento de soporte.</p>
        <RouterLink to="/login" class="login-button access-link">Ir a iniciar sesión</RouterLink>
      </div>

      <form v-else class="login-form" @submit.prevent="isRegister ? handleRegister() : handleLogin()">
        <div v-if="isRegister" class="form-group">
          <label for="nombre">Nombre completo</label>
          <input id="nombre" v-model="nombre" type="text" maxlength="100" autocomplete="name" required />
        </div>

        <div class="form-group">
          <label for="correo">Correo</label>
          <input id="correo" v-model="correo" type="email" maxlength="120" placeholder="nombre@empresa.com" autocomplete="username" required />
        </div>

        <div class="form-group">
          <label for="password">Contraseña</label>
          <input
            id="password" v-model="password" type="password" :minlength="isRegister ? 8 : undefined" placeholder="Ingresa tu contraseña"
            :autocomplete="isRegister ? 'new-password' : 'current-password'" required
          />
        </div>

        <p v-if="error" class="login-error" role="alert">{{ error }}</p>
        <p v-else-if="notice" class="login-notice" role="status">{{ notice }}</p>
        <button type="submit" class="login-button" :disabled="sending">{{ sending ? 'Un momento…' : isRegister ? 'Crear cuenta' : 'Iniciar sesión' }}</button>
        <p v-if="!isRegister && allowRegistration" class="demo-accounts">¿No tienes cuenta? <RouterLink to="/registro">Regístrate</RouterLink></p>
      </form>

      <footer class="login-footer"><p>UTH · Sistema de Soporte Técnico</p></footer>
    </section>
  </main>
</template>

<style scoped>
.login-error{margin:0;color:#b42318;font-size:13px;line-height:1.5}.login-notice{margin:0;color:#166534;font-size:13px}.demo-accounts{margin:0;color:#64748b;font-size:12px;line-height:1.6}.demo-access{display:flex;flex-direction:column;gap:10px;padding:16px;border-radius:10px;background:#f1f5f9;color:#334155;font-size:14px}
:root[data-theme="dark"] .login-error{color:#fca5a5}:root[data-theme="dark"] .login-notice{color:#86efac}:root[data-theme="dark"] .demo-accounts{color:#94a3b8}:root[data-theme="dark"] .demo-access{background:#1b2740;color:#cbd5e1}.demo-access p{margin:0 0 4px;line-height:1.5}.access-link{margin-top:8px;text-align:center;text-decoration:none}
</style>
