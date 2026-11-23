<script setup>
// Selector de vista del administrador (barra lateral): Administrador, Agente de cada departamento o Solicitante.
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { catalogsVersion, getCatalogs } from '../../services/IncidentService.js'
import { currentView } from '../../services/ViewService.js'

const router = useRouter()
const departments = ref([])

const selected = computed(() => {
  const view = currentView.value
  if (view?.role === 'agent') return `agent:${view.departamentoId}`
  if (view?.role === 'applicant') return 'applicant'
  return 'admin'
})

function change(event) {
  const value = event.target.value
  if (value === 'admin') return router.push({ name: 'AdminDashboard' })
  if (value === 'applicant') return router.push({ name: 'ApplicantDashboard' })
  router.push({ name: 'AgentDashboard', query: { departamento: value.split(':')[1] } })
}

// Se vuelve a leer cuando cambian los catálogos (crear, renombrar o desactivar departamentos).
watch(catalogsVersion, async () => {
  departments.value = (await getCatalogs().catch(() => ({ departamentos: [] }))).departamentos
}, { immediate: true })
</script>

<template>
  <label class="view-switcher">
    <span>Ver como</span>
    <select :value="selected" @change="change">
      <option value="admin">Administrador</option>
      <optgroup label="Agente">
        <option v-for="d in departments" :key="d.id" :value="`agent:${d.id}`">Agente · {{ d.nombre }}</option>
      </optgroup>
      <option value="applicant">Solicitante</option>
    </select>
  </label>
</template>

<style scoped>
/* Usa los colores del portal (--role-*) o, en el panel de administración, los del panel (--dash-*). */
.view-switcher{display:flex;flex-direction:column;gap:6px;margin:22px 10px 14px;color:var(--role-muted,var(--dash-muted));font-size:10px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase}
.view-switcher select{width:100%;padding:9px 10px;border:1px solid var(--role-border,var(--dash-border));border-radius:8px;background:var(--role-field,var(--role-card,var(--dash-card)));color:var(--role-text,var(--dash-text));font:600 13px Arial,sans-serif;letter-spacing:0;text-transform:none;cursor:pointer}
.view-switcher select:focus-visible{outline:2px solid var(--role-primary,var(--dash-primary));outline-offset:1px}
@media(max-width:720px){.view-switcher{margin:12px 0 0}}
</style>
