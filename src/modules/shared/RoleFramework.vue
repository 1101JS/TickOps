<script setup>
import { useRoute, useRouter } from 'vue-router'
import ThemeSwitcher from '../../components/ThemeSwitcher.vue'
import { logout } from '../../services/AuthService.js'

// items: [{ label, to }] donde "to" es una ubicación de vue-router, p. ej. { name: 'AgentDashboard', hash: '#queue' }.
const props = defineProps({
  role: { type: String, required: true },
  subtitle: { type: String, required: true },
  items: { type: Array, required: true }
})

const route = useRoute()
const router = useRouter()

// RouterLink ignora el #hash al marcar el enlace activo, así que se calcula aquí.
function isActive(item, index) {
  const target = router.resolve(item.to)
  if (target.path !== route.path) return false
  if (!target.hash) return true
  return route.hash ? route.hash === target.hash : index === props.items.findIndex((i) => router.resolve(i.to).path === route.path)
}

async function signOut() {
  await logout()
  router.push({ name: 'Landing' })
}
</script>

<template>
  <main class="role-framework">
    <aside class="role-sidebar">
      <RouterLink class="role-brand" to="/"><span>E</span><div><strong>ETicket</strong><small>{{ subtitle }}</small></div></RouterLink>
      <p class="role-label">{{ role }}</p>
      <nav class="role-navigation" :aria-label="`Navegación de ${role}`">
        <RouterLink
          v-for="(item, index) in items" :key="item.label" :to="item.to"
          :class="{ active: isActive(item, index) }" :aria-current="isActive(item, index) ? 'page' : undefined"
        >{{ item.label }}</RouterLink>
      </nav>
      <div class="role-footer">
        <ThemeSwitcher />
        <button class="role-logout" type="button" @click="signOut">Cerrar sesión</button>
      </div>
    </aside>
    <section class="role-content"><slot /></section>
  </main>
</template>

<style scoped>
.role-framework{display:flex;min-height:100vh;background:var(--role-bg);color:var(--role-text);font-family:Arial,sans-serif}
.role-sidebar{display:flex;flex:0 0 245px;flex-direction:column;padding:28px 18px;background:var(--role-card);border-right:1px solid var(--role-border)}
.role-brand{display:flex;align-items:center;gap:10px;color:var(--role-text);text-decoration:none}
.role-brand>span{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:var(--role-primary);color:#fff;font-weight:800}
.role-brand strong,.role-brand small{display:block}
.role-brand small,.role-label{color:var(--role-muted);font-size:12px}
.role-brand small{margin-top:2px}
.role-label{margin:42px 10px 10px;font-size:10px;font-weight:800;letter-spacing:1.2px}
.role-navigation{display:flex;flex-direction:column;gap:6px}
.role-navigation a{padding:11px 12px;border-radius:8px;color:var(--role-muted);font-size:14px;text-decoration:none}
.role-navigation a:hover,.role-navigation a.active{background:var(--role-primary-soft);color:var(--role-primary);font-weight:700}
.role-footer{display:flex;flex-direction:column;align-items:flex-start;gap:12px;margin-top:auto;padding-top:20px}
.role-logout{width:100%;padding:11px;border:0;border-radius:8px;background:transparent;color:var(--role-danger);cursor:pointer;text-align:left;font-size:14px}
.role-logout:hover{background:var(--role-danger-soft)}
.role-content{flex:1;min-width:0;padding:40px clamp(20px,4vw,58px) 60px}
@media(max-width:720px){.role-framework{flex-direction:column}.role-sidebar{flex-basis:auto;padding:16px;border-right:0;border-bottom:1px solid var(--role-border)}.role-label{margin:16px 0 7px}.role-navigation{flex-direction:row;flex-wrap:wrap}.role-navigation a{padding:7px 9px;font-size:12px}.role-footer{flex-direction:row;align-items:center;justify-content:space-between;padding-top:12px}.role-logout{width:auto}.role-content{padding:26px 16px 42px}}
</style>
