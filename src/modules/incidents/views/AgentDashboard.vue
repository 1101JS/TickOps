<script setup>
// Portal del agente. Dos vistas según la ruta: la bandeja (/agente) y "Nueva incidencia" (/agente/nueva), para que
// un agente —o el administrador en su vista de agente— también pueda registrar solicitudes a su nombre.
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AgentFramework from '../../agent/framework.vue'
import StatusFilterCards from '../../shared/StatusFilterCards.vue'
import NewIncidentForm from '../components/NewIncidentForm.vue'
import '../styles/RoleViews.css'
import { getSession } from '../../../services/AuthService.js'
import { actingUser } from '../../../services/ViewService.js'
import { formatDate, getCatalogs, getIncidents, matchesStatus, replaceIncident, slug, statusCards, updateIncident } from '../../../services/IncidentService.js'

const route = useRoute()
const router = useRouter()
// Con la vista de agente del administrador, "user" lleva el departamento elegido en el selector.
const user = computed(() => actingUser(getSession()))
const incidents = ref([])
const notice = ref('')
const error = ref('')
const scope = ref('departamento')
const status = ref('sin-asignar')
const search = ref('')
const priorityFilter = ref('')
const categoryFilter = ref('')
const catalogs = ref({ categorias: [], prioridades: [] })
const ownCategories = computed(() => catalogs.value.categorias.filter((c) => c.departamentoId === user.value?.departamentoId))
const isNew = computed(() => route.params.vista === 'nueva')
const newRoute = computed(() => ({ name: 'AgentDashboard', params: { vista: 'nueva' }, query: route.query }))
const queueRoute = computed(() => ({ name: 'AgentDashboard', query: route.query }))

// El servidor devuelve la cola del departamento del agente (más las incidencias que él mismo haya solicitado).
const department = computed(() => incidents.value.filter((i) => i.departamentoId === user.value?.departamentoId))
const mine = computed(() => department.value.filter((i) => i.agenteId === user.value?.id))
const requested = computed(() => incidents.value.filter((i) => i.solicitanteId === user.value?.id))
const scopes = computed(() => [
  { key: 'departamento', label: 'Departamento', items: department.value },
  { key: 'mias', label: 'Asignadas a mí', items: mine.value },
  { key: 'solicitadas', label: 'Mis solicitudes', items: requested.value }
])
const scoped = computed(() => scopes.value.find((t) => t.key === scope.value)?.items || [])
const cards = computed(() => statusCards(scoped.value, { unassigned: scope.value === 'departamento', late: scope.value !== 'solicitadas' }))
const openMine = computed(() => mine.value.filter((i) => matchesStatus(i, 'abiertas')).length)
const visible = computed(() => {
  const term = search.value.trim().toLowerCase()
  return scoped.value.filter((i) => {
    if (!matchesStatus(i, status.value)) return false
    if (priorityFilter.value && i.prioridadId !== Number(priorityFilter.value)) return false
    if (categoryFilter.value && i.categoriaId !== Number(categoryFilter.value)) return false
    return !term || [i.id, i.titulo, i.categoria, i.solicitante, i.agente].join(' ').toLowerCase().includes(term)
  })
})

// "Sin asignar" no existe en "Asignadas a mí" ni en "Mis solicitudes": se pasa a "Abiertas".
watch(scope, () => {
  if (!cards.value.some((c) => c.key === status.value)) status.value = 'abiertas'
})

async function load() {
  try {
    const [list, catalog] = await Promise.all([getIncidents(), getCatalogs()])
    incidents.value = list
    catalogs.value = catalog
  } catch (err) {
    error.value = err.message
  }
}

async function take(incident) {
  error.value = ''
  try {
    replaceIncident(incidents.value, await updateIncident(incident.id, { idAgente: user.value.id }))
    notice.value = `Tomaste la incidencia #${incident.id}; ahora está En Proceso.`
  } catch (err) {
    error.value = err.message
    await load()
  }
}

async function created(incident, filesProblem) {
  incidents.value.unshift(incident)
  await router.push(queueRoute.value)
  scope.value = 'solicitadas'
  status.value = 'abiertas'
  notice.value = `Incidencia #${incident.id} registrada a tu nombre en la cola de ${incident.departamento}.`
  if (filesProblem) error.value = `La incidencia #${incident.id} se registró, pero los archivos no se pudieron adjuntar: ${filesProblem}`
}

function openIncident(id) {
  router.push({ name: 'IncidentDetail', params: { id } })
}

onMounted(load)
// El administrador puede cambiar de departamento sin salir de la vista: se recarga la bandeja.
watch(() => user.value?.departamentoId, () => { notice.value = ''; error.value = ''; load() })
watch(() => route.params.vista, () => { notice.value = ''; error.value = '' }, { flush: 'sync' })
</script>

<template>
  <AgentFramework>
    <header id="summary" class="role-header compact-header">
      <div>
        <p class="eyebrow">{{ user?.departamento?.toUpperCase() || 'SIN DEPARTAMENTO' }}</p>
        <h1>{{ isNew ? 'Nueva incidencia' : `Hola, ${user?.nombre}` }}</h1>
        <p v-if="isNew">Quedará registrada a tu nombre como solicitante.</p>
        <p v-else>{{ openMine }} abierta(s) a tu cargo · elige un apartado para filtrar la bandeja.</p>
      </div>
      <RouterLink v-if="!isNew" class="primary" :to="newRoute">+ Nueva incidencia</RouterLink>
    </header>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <p v-else-if="notice" class="notice" role="status">{{ notice }}</p>
    <p v-if="!user?.departamentoId" class="notice error">Tu cuenta no tiene departamento asignado. Pide al administrador que te asigne uno.</p>

    <section v-if="isNew" class="role-card narrow-card">
      <NewIncidentForm cancelable @created="created" @cancel="router.push(queueRoute)" />
    </section>

    <template v-else>
      <div class="tabs scope-tabs" role="tablist" aria-label="Qué incidencias ver">
        <button v-for="t in scopes" :key="t.key" type="button" role="tab" :aria-selected="scope === t.key" :class="{ active: scope === t.key }" @click="scope = t.key">{{ t.label }} <span>{{ t.items.length }}</span></button>
      </div>
      <StatusFilterCards v-model="status" :options="cards" label="Apartados de la bandeja" />

      <section id="queue" class="role-card">
        <div class="section-title">
          <div><p class="eyebrow">BANDEJA DE TRABAJO</p><h2>{{ cards.find((c) => c.key === status)?.label }} <small class="count">{{ visible.length }}</small></h2></div>
          <div class="queue-filters">
            <select v-model="priorityFilter" class="filter" aria-label="Filtrar por prioridad"><option value="">Todas las prioridades</option><option v-for="p in catalogs.prioridades" :key="p.id" :value="p.id">{{ p.nombre }}</option></select>
            <select v-model="categoryFilter" class="filter" aria-label="Filtrar por categoría"><option value="">Todas las categorías</option><option v-for="c in ownCategories" :key="c.id" :value="c.id">{{ c.nombre }}</option></select>
            <input v-model="search" class="filter" type="search" placeholder="Buscar…" aria-label="Buscar incidencias" />
          </div>
        </div>
        <div class="ticket-list">
          <article v-for="incident in visible" :key="incident.id" class="ticket-row clickable" @click="openIncident(incident.id)">
            <div class="ticket-main">
              <strong>#{{ incident.id }} · {{ incident.titulo }}</strong>
              <small>{{ incident.categoria }} · {{ incident.solicitante }} · {{ formatDate(incident.fechaCreacion) }} · {{ incident.agente || 'Sin asignar' }}</small>
            </div>
            <span v-if="incident.totalRelacionadas" class="pill root" :title="`${incident.totalRelacionadas} incidencia(s) relacionada(s) con esta`">⛓ {{ incident.totalRelacionadas }}</span>
            <span v-if="incident.principalId" class="pill linked" :title="`Relacionada con la incidencia #${incident.principalId}`">↳ #{{ incident.principalId }}</span>
            <span class="pill" :class="`prio-${slug(incident.prioridad)}`">{{ incident.prioridad }}</span>
            <span v-if="incident.sla.resolucionVencida" class="pill late">SLA vencido</span>
            <span class="pill" :class="slug(incident.estado)">{{ incident.estado }}</span>
            <button v-if="!incident.agenteId && incident.acciones.gestionar" class="primary" type="button" @click.stop="take(incident)">Tomar</button>
            <button class="secondary" type="button" @click.stop="openIncident(incident.id)">Ver</button>
          </article>
          <p v-if="!visible.length" class="empty">No hay incidencias en este apartado.</p>
        </div>
      </section>
    </template>
  </AgentFramework>
</template>
