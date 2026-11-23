<script setup>
// Portal del solicitante. Dos vistas según la ruta: "Mis solicitudes" (/mis-incidencias) y "Nueva incidencia" (/mis-incidencias/nueva).
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ApplicantFramework from '../../applicant/framework.vue'
import StatusFilterCards from '../../shared/StatusFilterCards.vue'
import NewIncidentForm from '../components/NewIncidentForm.vue'
import '../styles/RoleViews.css'
import { getSession } from '../../../services/AuthService.js'
import { actingUser } from '../../../services/ViewService.js'
import { formatDate, getIncidents, matchesStatus, slug, statusCards } from '../../../services/IncidentService.js'

const route = useRoute()
const router = useRouter()
const user = actingUser(getSession())
const incidents = ref([])
const notice = ref('')
const error = ref('')
const filter = ref('abiertas')
const search = ref('')

const isNew = computed(() => route.params.vista === 'nueva')
const cards = computed(() => statusCards(incidents.value))
const open = computed(() => incidents.value.filter((i) => matchesStatus(i, 'abiertas')))
const visible = computed(() => {
  const term = search.value.trim().toLowerCase()
  return incidents.value.filter((i) => matchesStatus(i, filter.value) && (!term || [i.id, i.titulo, i.categoria, i.departamento].join(' ').toLowerCase().includes(term)))
})
const waitingForMe = computed(() => incidents.value.filter((i) => i.estado === 'Resuelto').length)

async function load() {
  try {
    incidents.value = await getIncidents()
  } catch (err) {
    error.value = err.message
  }
}

async function created(incident, filesProblem) {
  incidents.value.unshift(incident)
  filter.value = 'abiertas'
  await router.push({ name: 'ApplicantDashboard' })
  notice.value = `Tu incidencia #${incident.id} fue enviada a ${incident.departamento}. Te avisaremos aquí cuando la atiendan.`
  if (filesProblem) error.value = `La incidencia #${incident.id} se registró, pero los archivos no se pudieron adjuntar: ${filesProblem} Puedes adjuntarlos desde su ficha.`
}

function openIncident(id) {
  router.push({ name: 'IncidentDetail', params: { id } })
}

// Al cambiar de vista se limpian los avisos de la anterior (salvo el de "incidencia enviada", que se pone después).
// flush 'sync': se limpia en el mismo momento del cambio de ruta, antes de que created() ponga su aviso.
watch(() => route.path, () => { notice.value = ''; error.value = '' }, { flush: 'sync' })
onMounted(load)
</script>

<template>
  <ApplicantFramework>
    <header class="role-header compact-header">
      <div>
        <p class="eyebrow">PORTAL DE SOPORTE</p>
        <h1>{{ isNew ? 'Nueva incidencia' : `Hola, ${user?.nombre}` }}</h1>
        <p>{{ isNew ? 'Describe el problema y lo enviaremos al departamento que corresponde.' : 'Elige un apartado para ver tus solicitudes en ese estado.' }}</p>
      </div>
      <RouterLink v-if="!isNew" class="primary" :to="{ name: 'ApplicantDashboard', params: { vista: 'nueva' } }">+ Nueva incidencia</RouterLink>
    </header>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <p v-else-if="notice" class="notice" role="status">{{ notice }}</p>

    <section v-if="isNew" id="new-incident" class="role-card narrow-card">
      <NewIncidentForm cancelable @created="created" @cancel="router.push({ name: 'ApplicantDashboard' })" />
    </section>

    <template v-else>
      <p v-if="waitingForMe" class="notice info">Tienes {{ waitingForMe }} incidencia(s) resuelta(s): ábrela para confirmar la solución o reabrirla.</p>
      <StatusFilterCards v-model="filter" :options="cards" label="Apartados de mis solicitudes" />
      <section id="my-incidents" class="role-card">
        <div class="section-title">
          <div><p class="eyebrow">MIS SOLICITUDES</p><h2>{{ cards.find((c) => c.key === filter)?.label }} <small class="count">{{ visible.length }}</small></h2></div>
          <input v-model="search" class="filter" type="search" placeholder="Buscar…" aria-label="Buscar en mis solicitudes" />
        </div>
        <div class="ticket-list compact-list">
          <article v-for="incident in visible" :key="incident.id" class="ticket-row clickable" @click="openIncident(incident.id)">
            <div class="ticket-main">
              <strong>#{{ incident.id }} · {{ incident.titulo }}</strong>
              <small>{{ incident.departamento }} · {{ formatDate(incident.fechaCreacion) }} · {{ incident.agente ? `Atiende: ${incident.agente}` : 'Pendiente de asignación' }}</small>
            </div>
            <span v-if="incident.principalId" class="pill linked" title="Forma parte de un problema que el equipo atiende en conjunto">Problema general</span>
            <span class="pill" :class="slug(incident.estado)">{{ incident.estado }}</span>
            <button class="secondary" type="button" @click.stop="openIncident(incident.id)">Ver</button>
          </article>
          <div v-if="!visible.length" class="empty">
            <p>{{ incidents.length ? 'No tienes solicitudes en este apartado.' : 'Aún no has enviado incidencias.' }}</p>
            <RouterLink v-if="!incidents.length" class="primary" :to="{ name: 'ApplicantDashboard', params: { vista: 'nueva' } }">Registrar una incidencia</RouterLink>
          </div>
        </div>
      </section>
    </template>
  </ApplicantFramework>
</template>
