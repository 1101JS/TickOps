<script setup>
// Portal del solicitante. Dos vistas según la ruta: "Mis solicitudes" (/mis-incidencias) y "Nueva incidencia" (/mis-incidencias/nueva).
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ApplicantFramework from '../../applicant/framework.vue'
import '../styles/RoleViews.css'
import { getSession } from '../../../services/AuthService.js'
import { categoriesByDepartment, createIncident, formatDate, getCatalogs, getIncidents, slug } from '../../../services/IncidentService.js'

const route = useRoute()
const router = useRouter()
const user = getSession()
const incidents = ref([])
const catalogs = ref({ categorias: [], prioridades: [] })
const emptyForm = () => ({ titulo: '', descripcion: '', idCategoria: '', idPrioridad: catalogs.value.prioridades.find((p) => p.nombre === 'Media')?.id ?? '' })
const form = ref(emptyForm())
const notice = ref('')
const error = ref('')
const sending = ref(false)
const filter = ref('abiertas')

const isNew = computed(() => route.params.vista === 'nueva')
const groups = computed(() => categoriesByDepartment(catalogs.value.categorias))
const selectedCategory = computed(() => catalogs.value.categorias.find((c) => c.id === Number(form.value.idCategoria)))
const open = computed(() => incidents.value.filter((i) => !i.estadoFinal))
const visible = computed(() => (filter.value === 'abiertas' ? open.value : incidents.value))
const waitingForMe = computed(() => incidents.value.filter((i) => i.estado === 'Resuelto').length)

async function load() {
  try {
    const [list, catalog] = await Promise.all([getIncidents(), getCatalogs()])
    incidents.value = list
    catalogs.value = catalog
    // Solo completa la prioridad por defecto: no borra lo que el usuario ya haya escrito.
    if (!form.value.idPrioridad) form.value.idPrioridad = emptyForm().idPrioridad
  } catch (err) {
    error.value = err.message
  }
}

async function submit() {
  if (sending.value) return
  sending.value = true
  error.value = ''
  try {
    const incident = await createIncident({ ...form.value, idCategoria: Number(form.value.idCategoria), idPrioridad: Number(form.value.idPrioridad) })
    incidents.value.unshift(incident)
    form.value = emptyForm()
    filter.value = 'abiertas'
    await router.push({ name: 'ApplicantDashboard' })
    notice.value = `Tu incidencia #${incident.id} fue enviada a ${incident.departamento}. Te avisaremos aquí cuando la atiendan.`
  } catch (err) {
    error.value = err.message
  } finally {
    sending.value = false
  }
}

function openIncident(id) {
  router.push({ name: 'IncidentDetail', params: { id } })
}

// Al cambiar de vista se limpian los avisos de la anterior (salvo el de "incidencia enviada", que se pone después).
// flush 'sync': se limpia en el mismo momento del cambio de ruta, antes de que submit() ponga su aviso.
watch(() => route.path, () => { notice.value = ''; error.value = '' }, { flush: 'sync' })
onMounted(load)
</script>

<template>
  <ApplicantFramework>
    <header class="role-header">
      <div>
        <p class="eyebrow">PORTAL DE SOPORTE</p>
        <h1>{{ isNew ? 'Nueva incidencia' : `Hola, ${user?.nombre}` }}</h1>
        <p>{{ isNew ? 'Describe el problema y lo enviaremos al departamento que corresponde.' : 'Consulta el avance de tus solicitudes.' }}</p>
      </div>
      <div class="header-stat"><strong>{{ open.length }}</strong><span>abiertas</span></div>
    </header>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <p v-else-if="notice" class="notice" role="status">{{ notice }}</p>

    <section v-if="isNew" id="new-incident" class="role-card narrow-card">
      <div class="section-title"><div><p class="eyebrow">NUEVO REPORTE</p><h2>Registrar incidencia</h2></div></div>
      <form class="incident-form" @submit.prevent="submit">
        <label>Título<input v-model="form.titulo" maxlength="150" placeholder="Ej. No puedo acceder al sistema" required /></label>
        <div class="two-columns">
          <label>Categoría
            <select v-model="form.idCategoria" required>
              <option value="">Selecciona una opción</option>
              <optgroup v-for="g in groups" :key="g.departamento" :label="g.departamento">
                <option v-for="c in g.items" :key="c.id" :value="c.id">{{ c.nombre }}</option>
              </optgroup>
            </select>
          </label>
          <label>Prioridad
            <select v-model="form.idPrioridad" required>
              <option v-for="p in catalogs.prioridades" :key="p.id" :value="p.id">{{ p.nombre }}</option>
            </select>
          </label>
        </div>
        <p v-if="selectedCategory" class="hint">{{ selectedCategory.descripcion }} · la atenderá {{ selectedCategory.departamento }}.</p>
        <label>Descripción<textarea v-model="form.descripcion" maxlength="5000" placeholder="Indica qué ocurre, dónde sucede y desde cuándo..." required /></label>
        <button class="primary" type="submit" :disabled="sending">{{ sending ? 'Enviando...' : 'Enviar incidencia' }}</button>
      </form>
    </section>

    <template v-else>
      <p v-if="waitingForMe" class="notice info">Tienes {{ waitingForMe }} incidencia(s) resuelta(s): ábrela para confirmar la solución o reabrirla.</p>
      <section id="my-incidents" class="role-card">
        <div class="section-title">
          <div><p class="eyebrow">MIS SOLICITUDES</p><h2>Estado de incidencias</h2></div>
          <select v-model="filter" class="filter" aria-label="Filtrar solicitudes"><option value="abiertas">Abiertas</option><option value="todas">Todas ({{ incidents.length }})</option></select>
        </div>
        <div class="ticket-list compact-list">
          <article v-for="incident in visible" :key="incident.id" class="ticket-row">
            <div class="ticket-main">
              <strong>#{{ incident.id }} · {{ incident.titulo }}</strong>
              <small>{{ incident.departamento }} · {{ incident.categoria }} · {{ formatDate(incident.fechaCreacion) }} · {{ incident.agente ? `Atiende: ${incident.agente}` : 'Pendiente de asignación' }}</small>
            </div>
            <span class="pill" :class="slug(incident.estado)">{{ incident.estado }}</span>
            <button class="secondary" type="button" @click="openIncident(incident.id)">Ver detalle</button>
          </article>
          <div v-if="!visible.length" class="empty">
            <p>{{ incidents.length ? 'No tienes incidencias abiertas.' : 'Aún no has enviado incidencias.' }}</p>
            <RouterLink class="primary" :to="{ name: 'ApplicantDashboard', params: { vista: 'nueva' } }">Registrar una incidencia</RouterLink>
          </div>
        </div>
      </section>
    </template>
  </ApplicantFramework>
</template>
