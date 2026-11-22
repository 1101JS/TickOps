<script setup>
import { computed, onMounted, ref } from 'vue'
import AgentFramework from '../../agent/framework.vue'
import IncidentDetail from '../components/IncidentDetail.vue'
import '../styles/RoleViews.css'
import { getSession } from '../../../services/AuthService.js'
import { formatDate, getIncidents, replaceIncident, slug, updateIncident } from '../../../services/IncidentService.js'

const user = getSession()
const incidents = ref([])
const selectedId = ref(null)
const notice = ref('')
const error = ref('')
const tab = ref('cola')
const search = ref('')

// El servidor devuelve la cola del departamento del agente (más las incidencias que él mismo haya solicitado).
const department = computed(() => incidents.value.filter((i) => i.departamentoId === user?.departamentoId))
const queue = computed(() => department.value.filter((i) => !i.agenteId && !i.estadoFinal))
const mine = computed(() => department.value.filter((i) => i.agenteId === user?.id && !i.estadoFinal))
const late = computed(() => department.value.filter((i) => i.sla.resolucionVencida))
const tabs = computed(() => [
  { key: 'cola', label: 'Sin asignar', items: queue.value },
  { key: 'mias', label: 'Mis asignadas', items: mine.value },
  { key: 'departamento', label: 'Todo el departamento', items: department.value },
  { key: 'solicitadas', label: 'Mis solicitudes', items: incidents.value.filter((i) => i.solicitanteId === user?.id) }
])
const visible = computed(() => {
  const term = search.value.trim().toLowerCase()
  const items = tabs.value.find((t) => t.key === tab.value)?.items || []
  return term ? items.filter((i) => [i.id, i.titulo, i.categoria, i.solicitante, i.agente].join(' ').toLowerCase().includes(term)) : items
})

async function load() {
  try {
    incidents.value = await getIncidents()
  } catch (err) {
    error.value = err.message
  }
}

async function take(incident) {
  error.value = ''
  try {
    replaceIncident(incidents.value, await updateIncident(incident.id, { idAgente: user.id }))
    notice.value = `Tomaste la incidencia #${incident.id}; ahora está En Proceso.`
  } catch (err) {
    error.value = err.message
    await load()
  }
}

function onChanged(incident, id) {
  replaceIncident(incidents.value, incident, id)
  if (!incident) notice.value = `La incidencia #${id} fue transferida a otro departamento.`
}

onMounted(load)
</script>

<template>
  <AgentFramework>
    <header id="summary" class="role-header">
      <div><p class="eyebrow">{{ user?.departamento?.toUpperCase() || 'SIN DEPARTAMENTO' }}</p><h1>Hola, {{ user?.nombre }}</h1><p>Toma incidencias de la cola de tu departamento y dales seguimiento hasta resolverlas.</p></div>
      <div class="header-stat"><strong>{{ mine.length }}</strong><span>a tu cargo</span></div>
    </header>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <p v-else-if="notice" class="notice" role="status">{{ notice }}</p>
    <p v-if="!user?.departamentoId" class="notice error">Tu cuenta no tiene departamento asignado. Pide al administrador que te asigne uno.</p>

    <section class="summary-grid" aria-label="Resumen del departamento">
      <article><span>Sin asignar en la cola</span><strong>{{ queue.length }}</strong></article>
      <article><span>Mis asignadas abiertas</span><strong>{{ mine.length }}</strong></article>
      <article><span>SLA vencido</span><strong :class="{ danger: late.length }">{{ late.length }}</strong></article>
    </section>

    <section id="queue" class="role-card">
      <div class="section-title">
        <div><p class="eyebrow">BANDEJA DE TRABAJO</p><h2>Incidencias</h2></div>
        <input v-model="search" class="filter" type="search" placeholder="Buscar…" aria-label="Buscar incidencias" />
      </div>
      <div class="tabs" role="tablist">
        <button v-for="t in tabs" :key="t.key" type="button" role="tab" :aria-selected="tab === t.key" :class="{ active: tab === t.key }" @click="tab = t.key">{{ t.label }} <span>{{ t.items.length }}</span></button>
      </div>
      <div class="ticket-list">
        <article v-for="incident in visible" :key="incident.id" class="ticket-row">
          <div class="ticket-main">
            <strong>#{{ incident.id }} · {{ incident.titulo }}</strong>
            <small>{{ incident.categoria }} · {{ incident.solicitante }} · {{ formatDate(incident.fechaCreacion) }} · {{ incident.agente || 'Sin asignar' }}</small>
          </div>
          <span class="pill" :class="`prio-${slug(incident.prioridad)}`">{{ incident.prioridad }}</span>
          <span v-if="incident.sla.resolucionVencida" class="pill late">SLA vencido</span>
          <span class="pill" :class="slug(incident.estado)">{{ incident.estado }}</span>
          <button v-if="!incident.agenteId && incident.acciones.gestionar" class="primary" type="button" @click="take(incident)">Tomar</button>
          <button class="secondary" type="button" @click="selectedId = incident.id">Ver</button>
        </article>
        <p v-if="!visible.length" class="empty">No hay incidencias en esta bandeja.</p>
      </div>
    </section>

    <IncidentDetail v-if="selectedId" :incident-id="selectedId" :user="user" @close="selectedId = null" @changed="onChanged" />
  </AgentFramework>
</template>
