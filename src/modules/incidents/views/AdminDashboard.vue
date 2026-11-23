<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import '../styles/AdminDashboard.css'
import ThemeSwitcher from '../../../components/ThemeSwitcher.vue'
import AdminViewSwitcher from '../../shared/AdminViewSwitcher.vue'
import AppModal from '../../shared/AppModal.vue'
import StatusFilterCards from '../../shared/StatusFilterCards.vue'
import NewIncidentForm from '../components/NewIncidentForm.vue'
import { getSession, logout } from '../../../services/AuthService.js'
import { exportIncidentsToExcel, exportIncidentsToPdf } from '../../../services/ExportService.js'
import {
  createCategory, createDepartment, createUser, deleteCategory, deleteDepartment, categoriesByDepartment, formatDate, getAgents,
  getCatalogs, getCategories, getDepartments, getIncidents, getUsers, initials, matchesStatus, slug, statusCards, updateCategory, updateDepartment, updateUser
} from '../../../services/IncidentService.js'

const ROLES = [
  { key: 'admin', label: 'Administrador' },
  { key: 'agent', label: 'Agente' },
  { key: 'applicant', label: 'Solicitante' }
]

const route = useRoute()
const router = useRouter()
const user = getSession()
const catalogs = ref({ departamentos: [], categorias: [], prioridades: [], estados: [] })
const incidents = ref([])
const agents = ref([])
const users = ref([])
const categories = ref([])
const departments = ref([])
// Ventana abierta para crear: null | 'incident' | 'department' | 'category' | 'user'
const modal = ref(null)
const moreFilters = ref(false)
const notice = ref('')
const error = ref('')

const search = ref('')
const statusFilter = ref('abiertas')
const departmentFilter = ref('')
const priorityFilter = ref('')
const categoryFilter = ref('')
const dateFrom = ref('')
const dateTo = ref('')

const emptyUser = () => ({ nombre: '', correo: '', password: '', role: 'applicant', idDepartamento: '' })
const newUser = ref(emptyUser())
const editingUser = ref(null)
const emptyDepartment = () => ({ nombre: '', descripcion: '' })
const newDepartment = ref(emptyDepartment())
const editingDepartment = ref(null)
const emptyCategory = () => ({ nombre: '', descripcion: '', idDepartamento: '' })
const newCategory = ref(emptyCategory())
const editingCategory = ref(null)
const categoryDepartment = ref('')

const cards = computed(() => statusCards(incidents.value, { unassigned: true, late: true }))
// Lo que requiere atención ya: abiertas con SLA vencido o sin agente (las más antiguas primero).
const attention = computed(() =>
  incidents.value.filter((i) => matchesStatus(i, 'abiertas') && (i.sla.resolucionVencida || !i.agenteId)).reverse().slice(0, 6)
)
const activeDepartments = computed(() => departments.value.filter((d) => d.activo))
const departmentsWithoutAgents = computed(() => activeDepartments.value.filter((d) => !d.agentes))
const userSearch = ref('')
const visibleUsers = computed(() => {
  const term = userSearch.value.trim().toLowerCase()
  return users.value.filter((u) => !term || [u.nombre, u.correo, u.rol, u.departamento].join(' ').toLowerCase().includes(term))
})
// Categorías del filtro: las del departamento elegido (o todas, agrupadas por departamento).
const filterCategoryGroups = computed(() =>
  categoriesByDepartment(catalogs.value.categorias.filter((c) => !departmentFilter.value || c.departamentoId === Number(departmentFilter.value)))
)
const extraFilters = computed(() => Boolean(departmentFilter.value || categoryFilter.value || dateFrom.value || dateTo.value))
const activeFilters = computed(() => Boolean(search.value || priorityFilter.value || extraFilters.value || statusFilter.value !== 'abiertas'))
const filteredIncidents = computed(() => {
  const term = search.value.trim().toLowerCase()
  // Las fechas del filtro son días locales completos: desde las 00:00 del inicio hasta las 23:59 del fin.
  const from = dateFrom.value ? new Date(`${dateFrom.value}T00:00:00`) : null
  const to = dateTo.value ? new Date(`${dateTo.value}T23:59:59.999`) : null
  return incidents.value.filter((i) => {
    if (!matchesStatus(i, statusFilter.value)) return false
    if (departmentFilter.value && i.departamentoId !== Number(departmentFilter.value)) return false
    if (priorityFilter.value && i.prioridadId !== Number(priorityFilter.value)) return false
    if (categoryFilter.value && i.categoriaId !== Number(categoryFilter.value)) return false
    const created = new Date(i.fechaCreacion)
    if (from && created < from) return false
    if (to && created > to) return false
    return !term || [i.id, i.titulo, i.categoria, i.solicitante, i.agente].join(' ').toLowerCase().includes(term)
  })
})

// Texto con los filtros aplicados, para el encabezado de los reportes.
const filterSummary = computed(() => {
  const parts = []
  const name = (list, id) => list.find((item) => item.id === Number(id))?.nombre
  const states = { abiertas: 'Abiertas', 'sin-asignar': 'Sin asignar', vencidas: 'SLA vencido', todas: '' }
  const state = statusFilter.value in states ? states[statusFilter.value] : statusFilter.value
  if (state) parts.push(`Estado: ${state}`)
  if (priorityFilter.value) parts.push(`Prioridad: ${name(catalogs.value.prioridades, priorityFilter.value)}`)
  if (departmentFilter.value) parts.push(`Departamento: ${name(catalogs.value.departamentos, departmentFilter.value)}`)
  if (categoryFilter.value) parts.push(`Categoría: ${name(catalogs.value.categorias, categoryFilter.value)}`)
  if (dateFrom.value) parts.push(`Desde: ${dateFrom.value.split('-').reverse().join('/')}`)
  if (dateTo.value) parts.push(`Hasta: ${dateTo.value.split('-').reverse().join('/')}`)
  if (search.value.trim()) parts.push(`Búsqueda: "${search.value.trim()}"`)
  return parts.join(' · ')
})
const exporting = ref('')

async function exportReport(format) {
  if (exporting.value) return
  exporting.value = format
  try {
    const list = filteredIncidents.value
    if (format === 'excel') await exportIncidentsToExcel(list, { filters: filterSummary.value })
    else {
      const count = (estado) => list.filter((i) => i.estado === estado).length
      const summary = ['Pendiente', 'En Proceso', 'Resuelto', 'Cerrado', 'Rechazado'].map((e) => `${e}: ${count(e)}`)
      summary.push(`SLA vencido: ${list.filter((i) => i.sla.resolucionVencida).length}`)
      await exportIncidentsToPdf(list, { filters: filterSummary.value, summary })
    }
    show(`Reporte ${format === 'excel' ? 'Excel' : 'PDF'} generado con ${list.length} incidencia(s).`)
  } catch (err) {
    fail(new Error(`No se pudo generar el reporte: ${err.message}`))
  } finally {
    exporting.value = ''
  }
}

function clearFilters() {
  search.value = ''
  departmentFilter.value = ''
  priorityFilter.value = ''
  categoryFilter.value = ''
  dateFrom.value = ''
  dateTo.value = ''
  statusFilter.value = 'abiertas'
}

// Si cambia el departamento y la categoría elegida ya no le pertenece, se quita.
watch(departmentFilter, () => {
  if (categoryFilter.value && !filterCategoryGroups.value.some((g) => g.items.some((c) => c.id === Number(categoryFilter.value)))) categoryFilter.value = ''
})
const visibleCategories = computed(() =>
  categories.value.filter((c) => !categoryDepartment.value || c.departamentoId === Number(categoryDepartment.value))
)
const agentsByDepartment = computed(() =>
  catalogs.value.departamentos.map((d) => ({ ...d, agents: agents.value.filter((a) => a.departamentoId === d.id) }))
)

function show(message) { error.value = ''; notice.value = message }
function fail(err) { notice.value = ''; error.value = err.message || 'Ocurrió un error inesperado.' }

async function loadData() {
  try {
    const [catalog, incidentList, agentList, userList, categoryList, departmentList] = await Promise.all([
      getCatalogs(), getIncidents(), getAgents(), getUsers(), getCategories(), getDepartments()
    ])
    catalogs.value = catalog
    incidents.value = incidentList
    agents.value = agentList
    users.value = userList
    categories.value = categoryList
    departments.value = departmentList
  } catch (err) { fail(err) }
}

async function refreshAgents() {
  agents.value = await getAgents().catch(() => agents.value)
}

function openModal(name) {
  error.value = ''
  notice.value = ''
  modal.value = name
}

function incidentCreated(incident, filesProblem) {
  incidents.value.unshift(incident)
  modal.value = null
  statusFilter.value = 'abiertas'
  goTo('incidents')
  show(`Incidencia #${incident.id} registrada en la cola de ${incident.departamento}.`)
  if (filesProblem) fail(new Error(`La incidencia #${incident.id} se registró, pero los archivos no se pudieron adjuntar: ${filesProblem}`))
}

function openIncident(id) {
  router.push({ name: 'IncidentDetail', params: { id } })
}

async function submitUser() {
  try {
    const { idDepartamento, ...fields } = newUser.value
    const created = await createUser({ ...fields, idDepartamento: idDepartamento ? Number(idDepartamento) : null })
    users.value.push(created)
    newUser.value = emptyUser()
    modal.value = null
    show(`Usuario ${created.correo} creado como ${created.rol}.`)
    await refreshAgents()
  } catch (err) { fail(err) }
}

function openUserEditor(target) {
  editingUser.value = { id: target.id, nombre: target.nombre, correo: target.correo, role: target.role, idDepartamento: target.departamentoId ?? '', password: '' }
}

async function saveUser() {
  const draft = editingUser.value
  try {
    const changes = { nombre: draft.nombre, correo: draft.correo, role: draft.role, idDepartamento: draft.idDepartamento ? Number(draft.idDepartamento) : null }
    if (draft.password) changes.password = draft.password
    const updated = await updateUser(draft.id, changes)
    users.value = users.value.map((u) => (u.id === updated.id ? updated : u))
    editingUser.value = null
    show(`Usuario ${updated.correo} actualizado.`)
    await refreshAgents()
  } catch (err) { fail(err) }
}

async function toggleActive(target) {
  try {
    const updated = await updateUser(target.id, { activo: !target.activo })
    users.value = users.value.map((u) => (u.id === updated.id ? updated : u))
    show(`${updated.nombre} ${updated.activo ? 'reactivado' : 'desactivado'}.`)
    await refreshAgents()
  } catch (err) { fail(err) }
}

// Tras cambiar categorías se recargan los catálogos (los formularios de incidencias solo ofrecen las activas).
async function refreshCatalogs() {
  catalogs.value = await getCatalogs(true).catch(() => catalogs.value)
}

function replaceCategory(updated) {
  categories.value = categories.value.map((c) => (c.id === updated.id ? updated : c))
}

async function submitCategory() {
  try {
    const { idDepartamento, ...fields } = newCategory.value
    const created = await createCategory({ ...fields, idDepartamento: Number(idDepartamento) })
    categories.value.push(created)
    categories.value.sort((a, b) => a.departamento.localeCompare(b.departamento) || a.nombre.localeCompare(b.nombre))
    newCategory.value = emptyCategory()
    modal.value = null
    show(`Categoría "${created.nombre}" creada en ${created.departamento}.`)
    await refreshCatalogs()
  } catch (err) { fail(err) }
}

function openCategoryEditor(category) {
  editingCategory.value = { id: category.id, nombre: category.nombre, descripcion: category.descripcion || '', idDepartamento: category.departamentoId, incidencias: category.incidencias }
}

async function saveCategory() {
  const draft = editingCategory.value
  try {
    const updated = await updateCategory(draft.id, { nombre: draft.nombre, descripcion: draft.descripcion, idDepartamento: Number(draft.idDepartamento) })
    replaceCategory(updated)
    editingCategory.value = null
    show(`Categoría "${updated.nombre}" actualizada.`)
    await refreshCatalogs()
  } catch (err) { fail(err) }
}

async function toggleCategory(category) {
  try {
    const updated = await updateCategory(category.id, { activa: !category.activa })
    replaceCategory(updated)
    show(updated.activa ? `Categoría "${updated.nombre}" reactivada.` : `Categoría "${updated.nombre}" desactivada: ya no se ofrecerá en incidencias nuevas.`)
    await refreshCatalogs()
  } catch (err) { fail(err) }
}

async function removeCategory(category) {
  if (!window.confirm(`¿Eliminar la categoría "${category.nombre}"? Esta acción no se puede deshacer.`)) return
  try {
    await deleteCategory(category.id)
    categories.value = categories.value.filter((c) => c.id !== category.id)
    show(`Categoría "${category.nombre}" eliminada.`)
    await refreshCatalogs()
  } catch (err) { fail(err) }
}

// ---------- Departamentos ----------
// Un cambio de departamento afecta catálogos, categorías, agentes e incidencias (nombres y opciones): se recarga todo.
async function afterDepartmentChange(message) {
  await getCatalogs(true).catch(() => {})
  await loadData()
  show(message)
}

async function submitDepartment() {
  try {
    const created = await createDepartment({ ...newDepartment.value })
    newDepartment.value = emptyDepartment()
    modal.value = null
    await afterDepartmentChange(`Departamento "${created.nombre}" creado. Agrégale categorías y agentes para que pueda recibir incidencias.`)
  } catch (err) { fail(err) }
}

function openDepartmentEditor(department) {
  editingDepartment.value = { id: department.id, nombre: department.nombre, descripcion: department.descripcion || '' }
}

async function saveDepartment() {
  const draft = editingDepartment.value
  try {
    const updated = await updateDepartment(draft.id, { nombre: draft.nombre, descripcion: draft.descripcion })
    editingDepartment.value = null
    await afterDepartmentChange(`Departamento "${updated.nombre}" actualizado.`)
  } catch (err) { fail(err) }
}

async function toggleDepartment(department) {
  try {
    const updated = await updateDepartment(department.id, { activo: !department.activo })
    const agentsNote = updated.agentes ? ` Sus ${updated.agentes} agente(s) siguen activos: reasígnalos en Usuarios si es necesario.` : ''
    await afterDepartmentChange(updated.activo
      ? `Departamento "${updated.nombre}" reactivado.`
      : `Departamento "${updated.nombre}" desactivado: sus categorías ya no se ofrecen en incidencias nuevas.${agentsNote}`)
  } catch (err) { fail(err) }
}

async function removeDepartment(department) {
  if (!window.confirm(`¿Eliminar el departamento "${department.nombre}"? Esta acción no se puede deshacer.`)) return
  try {
    await deleteDepartment(department.id)
    await afterDepartmentChange(`Departamento "${department.nombre}" eliminado.`)
  } catch (err) { fail(err) }
}

function showDepartmentCategories(department) {
  categoryDepartment.value = department.activo ? department.id : ''
  goTo('categories')
}

// ---------- Navegación entre módulos ----------
// Se muestra un módulo a la vez (el de la barra lateral, guardado en el #hash de la dirección), cada uno con su
// resumen arriba. Así no hay que recorrer toda la página con scroll para llegar a otro módulo.
const SECTIONS = [
  { key: 'panel', icon: '⌂', label: 'Panel principal' },
  { key: 'incidents', icon: '▤', label: 'Incidencias' },
  { key: 'agents', icon: '♙', label: 'Agentes' },
  { key: 'departments', icon: '◫', label: 'Departamentos' },
  { key: 'categories', icon: '▦', label: 'Categorías' },
  { key: 'users', icon: '⚙', label: 'Usuarios' }
]
const activeSection = computed(() => {
  const key = route.hash.slice(1)
  return SECTIONS.some((section) => section.key === key) ? key : 'panel'
})

function goTo(section) {
  if (activeSection.value !== section) router.push({ hash: `#${section}` })
}

// Desde el panel, un recuadro de estado abre Incidencias con ese apartado elegido.
function showIncidents(status) {
  statusFilter.value = status
  goTo('incidents')
}

// Enlace "#new-incident" (p. ej. desde la ficha de una incidencia): abre el formulario en Incidencias.
watch(() => route.hash, (hash) => {
  if (hash === '#new-incident') {
    router.replace({ hash: '#incidents' })
    openModal('incident')
  }
}, { immediate: true })

// En teléfonos la barra de abajo se desliza para que el módulo marcado quede visible.
watch(activeSection, async () => {
  if (window.innerWidth > 760) return
  await nextTick()
  document.querySelector('.sidebar-nav .nav-item.active')?.scrollIntoView({ block: 'nearest', inline: 'center' })
})

async function handleLogout() { await logout(); router.push({ name: 'Landing' }) }

onMounted(loadData)
</script>

<template>
  <main class="dashboard admin-dashboard">
    <aside class="dashboard-sidebar">
      <div class="sidebar-brand"><span class="brand-mark">T</span><div><h2>TickOps</h2><span>Administración</span></div></div>
      <AdminViewSwitcher />
      <nav class="sidebar-nav" aria-label="Módulos de administración">
        <button
          v-for="section in SECTIONS" :key="section.key" type="button" class="nav-item" :class="{ active: activeSection === section.key }"
          :aria-current="activeSection === section.key ? 'page' : undefined" @click="goTo(section.key)"
        >{{ section.icon }} {{ section.label }}</button>
      </nav>
      <div class="sidebar-theme"><ThemeSwitcher /></div>
      <button class="logout-button" @click="handleLogout">Cerrar sesión</button>
    </aside>

    <section class="dashboard-content">
      <p v-if="error && !modal" class="form-notice error" role="alert">{{ error }}</p>
      <p v-else-if="notice" class="form-notice" role="status">{{ notice }}</p>

      <!-- ---------- Panel principal: resumen de todo, cada dato lleva a su módulo ---------- -->
      <template v-if="activeSection === 'panel'">
        <header class="dashboard-header">
          <div><p class="eyebrow">CENTRO DE CONTROL</p><h1>Panel principal</h1><p>Hola, {{ user?.nombre }}. Elige un apartado para ver esas incidencias.</p></div>
          <button class="primary-button header-action" @click="openModal('incident')">+ Nueva incidencia</button>
        </header>
        <StatusFilterCards :model-value="''" :options="cards" label="Incidencias por apartado" @update:model-value="showIncidents" />
        <div class="overview-grid">
          <button type="button" class="overview-card" @click="goTo('agents')">
            <span>Agentes activos</span><strong>{{ agents.length }}</strong><small>{{ agents.filter((a) => a.carga === 0).length }} disponibles</small>
          </button>
          <button type="button" class="overview-card" :class="{ warn: departmentsWithoutAgents.length }" @click="goTo('departments')">
            <span>Departamentos activos</span><strong>{{ activeDepartments.length }}</strong>
            <small>{{ departmentsWithoutAgents.length ? `${departmentsWithoutAgents.length} sin agentes` : 'todos con agentes' }}</small>
          </button>
          <button type="button" class="overview-card" @click="goTo('categories')">
            <span>Categorías</span><strong>{{ categories.filter((c) => c.activa).length }}</strong><small>activas de {{ categories.length }}</small>
          </button>
          <button type="button" class="overview-card" @click="goTo('users')">
            <span>Usuarios</span><strong>{{ users.filter((u) => u.activo).length }}</strong><small>activos de {{ users.length }}</small>
          </button>
        </div>
        <section class="card compact-card">
          <div class="section-heading"><div><p class="eyebrow">REQUIEREN ATENCIÓN</p><h2>SLA vencido o sin agente</h2></div><button class="text-button" @click="showIncidents('abiertas')">Ver todas las abiertas →</button></div>
          <ul class="attention-list">
            <li v-for="incident in attention" :key="incident.id" @click="openIncident(incident.id)">
              <div><strong>#{{ incident.id }} · {{ incident.titulo }}</strong><small>{{ incident.departamento }} · {{ formatDate(incident.fechaCreacion) }}</small></div>
              <span v-if="incident.sla.resolucionVencida" class="status-pill rechazado">SLA vencido</span>
              <span v-if="!incident.agenteId" class="status-pill pendiente">Sin agente</span>
            </li>
            <li v-if="!attention.length" class="empty-state">Todo al día: no hay incidencias vencidas ni sin agente.</li>
          </ul>
        </section>
      </template>

      <!-- ---------- Incidencias ---------- -->
      <template v-else-if="activeSection === 'incidents'">
        <header class="dashboard-header">
          <div><p class="eyebrow">SEGUIMIENTO</p><h1>Incidencias</h1><p>Elige un apartado; los filtros finos están en «Más filtros».</p></div>
          <button class="primary-button header-action" @click="openModal('incident')">+ Nueva incidencia</button>
        </header>
        <StatusFilterCards v-model="statusFilter" :options="cards" label="Apartados de incidencias" />
        <section class="card incident-management">
          <div class="toolbar">
            <input v-model="search" type="search" placeholder="Buscar por número, título, solicitante o agente" aria-label="Buscar incidencias" />
            <select v-model="priorityFilter" aria-label="Filtrar por prioridad"><option value="">Todas las prioridades</option><option v-for="p in catalogs.prioridades" :key="p.id" :value="p.id">{{ p.nombre }}</option></select>
            <button type="button" class="secondary-button toolbar-button" :aria-expanded="moreFilters || extraFilters" @click="moreFilters = !moreFilters">
              {{ moreFilters || extraFilters ? 'Menos filtros' : 'Más filtros' }}{{ extraFilters ? ' •' : '' }}
            </button>
          </div>
          <div v-if="moreFilters || extraFilters" class="toolbar filter-row">
            <select v-model="departmentFilter" aria-label="Filtrar por departamento"><option value="">Todos los departamentos</option><option v-for="d in catalogs.departamentos" :key="d.id" :value="d.id">{{ d.nombre }}</option></select>
            <select v-model="categoryFilter" aria-label="Filtrar por categoría">
              <option value="">Todas las categorías</option>
              <optgroup v-for="g in filterCategoryGroups" :key="g.departamento" :label="g.departamento"><option v-for="c in g.items" :key="c.id" :value="c.id">{{ c.nombre }}</option></optgroup>
            </select>
            <label class="date-filter">Desde<input v-model="dateFrom" type="date" :max="dateTo || undefined" aria-label="Registradas desde" /></label>
            <label class="date-filter">Hasta<input v-model="dateTo" type="date" :min="dateFrom || undefined" aria-label="Registradas hasta" /></label>
          </div>
          <div class="list-meta">
            <span>{{ filteredIncidents.length }} de {{ incidents.length }}</span>
            <button v-if="activeFilters" type="button" class="text-button" @click="clearFilters">Limpiar filtros</button>
            <span class="list-meta-actions">
              <button type="button" class="text-button" :disabled="Boolean(exporting)" @click="exportReport('excel')">{{ exporting === 'excel' ? 'Generando…' : '⇩ Excel' }}</button>
              <button type="button" class="text-button" :disabled="Boolean(exporting)" @click="exportReport('pdf')">{{ exporting === 'pdf' ? 'Generando…' : '⇩ PDF' }}</button>
            </span>
          </div>
          <div class="incident-table-wrap"><table class="incident-table">
            <thead><tr><th>Incidencia</th><th>Departamento</th><th>Prioridad</th><th>Estado</th><th>Agente</th><th></th></tr></thead>
            <tbody>
              <tr v-for="incident in filteredIncidents" :key="incident.id" class="clickable-row" @click="openIncident(incident.id)">
                <td>
                  <strong>#{{ incident.id }} · {{ incident.titulo }}</strong>
                  <small>
                    {{ incident.solicitante }} · {{ formatDate(incident.fechaCreacion) }}
                    <span v-if="incident.principalId" class="relation-tag" :title="`Relacionada con la incidencia #${incident.principalId}`">↳ #{{ incident.principalId }}</span>
                    <span v-if="incident.totalRelacionadas" class="relation-tag" :title="`${incident.totalRelacionadas} incidencia(s) relacionada(s)`">⛓ {{ incident.totalRelacionadas }}</span>
                  </small>
                </td>
                <td><strong>{{ incident.departamento }}</strong><small>{{ incident.categoria }}</small></td>
                <td><span class="priority" :class="slug(incident.prioridad)">{{ incident.prioridad }}</span></td>
                <td><span class="status-pill" :class="slug(incident.estado)">{{ incident.estado }}</span><small v-if="incident.sla.resolucionVencida" class="late-text">SLA vencido</small></td>
                <td>{{ incident.agente || 'Sin asignar' }}</td>
                <td class="table-actions"><button class="text-button" @click.stop="openIncident(incident.id)">Abrir →</button></td>
              </tr>
              <tr v-if="!filteredIncidents.length"><td colspan="6" class="empty-state">{{ incidents.length ? 'No hay incidencias en este apartado con esos filtros.' : 'Todavía no hay incidencias registradas.' }}</td></tr>
            </tbody>
          </table></div>
        </section>
      </template>

      <!-- ---------- Agentes ---------- -->
      <template v-else-if="activeSection === 'agents'">
        <header class="dashboard-header">
          <div><p class="eyebrow">EQUIPO DE SOPORTE</p><h1>Agentes</h1><p>{{ agents.length }} activo(s) · la carga cuenta incidencias pendientes o en proceso.</p></div>
          <button class="primary-button header-action" @click="newUser = { ...emptyUser(), role: 'agent' }; openModal('user')">+ Nuevo agente</button>
        </header>
        <section class="card">
          <div v-for="d in agentsByDepartment" :key="d.id" class="department-block">
            <h3>{{ d.nombre }} <small>{{ d.agents.length }} agente(s)</small></h3>
            <div class="technician-grid">
              <article v-for="agent in d.agents" :key="agent.id" class="technician-card">
                <div class="technician-avatar">{{ initials(agent.nombre) }}</div>
                <div class="technician-info"><h3>{{ agent.nombre }}</h3><small>{{ agent.correo }}</small></div>
                <span class="workload" :class="{ available: agent.carga === 0 }">{{ agent.carga === 0 ? 'Disponible' : `${agent.carga} abierta${agent.carga > 1 ? 's' : ''}` }}</span>
              </article>
            </div>
            <p v-if="!d.agents.length" class="section-note">Sin agentes: sus incidencias no podrán atenderse.</p>
          </div>
        </section>
      </template>

      <!-- ---------- Departamentos ---------- -->
      <template v-else-if="activeSection === 'departments'">
        <header class="dashboard-header">
          <div><p class="eyebrow">ORGANIZACIÓN</p><h1>Departamentos</h1><p>{{ activeDepartments.length }} activo(s){{ departmentsWithoutAgents.length ? ` · ${departmentsWithoutAgents.length} sin agentes` : '' }} · cada uno atiende las incidencias de sus categorías.</p></div>
          <button class="primary-button header-action" @click="openModal('department')">+ Nuevo departamento</button>
        </header>
        <section class="card">
          <div class="incident-table-wrap"><table class="incident-table">
            <thead><tr><th>Departamento</th><th>Categorías</th><th>Agentes</th><th>Incidencias</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              <tr v-for="d in departments" :key="d.id" :class="{ inactive: !d.activo }">
                <td><strong>{{ d.nombre }}</strong><small>{{ d.descripcion || 'Sin descripción' }} · desde {{ formatDate(d.fechaCreacion) }}</small></td>
                <td><strong>{{ d.categoriasActivas }}</strong><small>{{ d.categorias === d.categoriasActivas ? 'activas' : `activas de ${d.categorias}` }}</small></td>
                <td><strong :class="{ 'danger-text': d.activo && !d.agentes }">{{ d.agentes }}</strong><small>{{ d.activo && !d.agentes ? 'sin agentes' : 'activos' }}</small></td>
                <td><strong>{{ d.incidencias }}</strong><small>{{ d.abiertas }} abierta(s)</small></td>
                <td><span class="status-pill" :class="d.activo ? 'resuelto' : 'cerrado'">{{ d.activo ? 'Activo' : 'Inactivo' }}</span></td>
                <td class="table-actions">
                  <button class="text-button" @click="openDepartmentEditor(d)">Editar</button>
                  <button class="text-button" @click="showDepartmentCategories(d)">Categorías</button>
                  <RouterLink v-if="d.activo" class="text-button" :to="{ name: 'AgentDashboard', query: { departamento: d.id } }">Ver como agente</RouterLink>
                  <button class="text-button" @click="toggleDepartment(d)">{{ d.activo ? 'Desactivar' : 'Reactivar' }}</button>
                  <button v-if="!d.enUso" class="text-button danger-text" @click="removeDepartment(d)">Eliminar</button>
                </td>
              </tr>
              <tr v-if="!departments.length"><td colspan="6" class="empty-state">No hay departamentos registrados.</td></tr>
            </tbody>
          </table></div>
        </section>
      </template>

      <!-- ---------- Categorías ---------- -->
      <template v-else-if="activeSection === 'categories'">
        <header class="dashboard-header">
          <div><p class="eyebrow">CLASIFICACIÓN</p><h1>Categorías</h1><p>{{ categories.filter((c) => c.activa).length }} activa(s) de {{ categories.length }} · la categoría decide qué departamento atiende cada incidencia.</p></div>
          <button class="primary-button header-action" @click="newCategory = { ...emptyCategory(), idDepartamento: categoryDepartment }; openModal('category')">+ Nueva categoría</button>
        </header>
        <section class="card">
          <div class="toolbar">
            <select v-model="categoryDepartment" aria-label="Filtrar categorías por departamento"><option value="">Todos los departamentos</option><option v-for="d in catalogs.departamentos" :key="d.id" :value="d.id">{{ d.nombre }}</option></select>
          </div>
          <div class="incident-table-wrap"><table class="incident-table">
            <thead><tr><th>Categoría</th><th>Departamento</th><th>Incidencias</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              <tr v-for="c in visibleCategories" :key="c.id" :class="{ inactive: !c.activa }">
                <td><strong>{{ c.nombre }}</strong><small>{{ c.descripcion || 'Sin descripción' }}</small></td>
                <td>{{ c.departamento }}</td>
                <td><strong>{{ c.incidencias }}</strong><small>{{ c.abiertas }} abierta(s)</small></td>
                <td><span class="status-pill" :class="c.activa ? 'resuelto' : 'cerrado'">{{ c.activa ? 'Activa' : 'Inactiva' }}</span></td>
                <td class="table-actions">
                  <button class="text-button" @click="openCategoryEditor(c)">Editar</button>
                  <button class="text-button" @click="toggleCategory(c)">{{ c.activa ? 'Desactivar' : 'Reactivar' }}</button>
                  <button v-if="!c.enUso" class="text-button danger-text" @click="removeCategory(c)">Eliminar</button>
                </td>
              </tr>
              <tr v-if="!visibleCategories.length"><td colspan="5" class="empty-state">No hay categorías en este departamento.</td></tr>
            </tbody>
          </table></div>
        </section>
      </template>

      <!-- ---------- Usuarios ---------- -->
      <template v-else-if="activeSection === 'users'">
        <header class="dashboard-header">
          <div><p class="eyebrow">ACCESOS</p><h1>Usuarios</h1><p>{{ users.filter((u) => u.activo).length }} activo(s) de {{ users.length }} · {{ ROLES.map((r) => `${users.filter((u) => u.role === r.key).length} ${r.label.toLowerCase()}(es)`).join(' · ') }}</p></div>
          <button class="primary-button header-action" @click="newUser = emptyUser(); openModal('user')">+ Nuevo usuario</button>
        </header>
        <section class="card">
          <div class="toolbar"><input v-model="userSearch" type="search" placeholder="Buscar por nombre, correo, rol o departamento" aria-label="Buscar usuarios" /></div>
          <div class="incident-table-wrap"><table class="incident-table">
            <thead><tr><th>Usuario</th><th>Rol</th><th>Departamento</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              <tr v-for="u in visibleUsers" :key="u.id" :class="{ inactive: !u.activo }">
                <td><strong>{{ u.nombre }}</strong><small>{{ u.correo }}</small></td>
                <td>{{ u.rol }}</td>
                <td>{{ u.departamento || '—' }}</td>
                <td><span class="status-pill" :class="u.activo ? 'resuelto' : 'cerrado'">{{ u.activo ? 'Activo' : 'Inactivo' }}</span></td>
                <td class="table-actions">
                  <button class="text-button" @click="openUserEditor(u)">Editar</button>
                  <button v-if="u.id !== user?.id" class="text-button" @click="toggleActive(u)">{{ u.activo ? 'Desactivar' : 'Reactivar' }}</button>
                </td>
              </tr>
              <tr v-if="!visibleUsers.length"><td colspan="5" class="empty-state">No hay usuarios con esa búsqueda.</td></tr>
            </tbody>
          </table></div>
        </section>
      </template>
    </section>

    <!-- ---------- Ventanas para crear ---------- -->
    <AppModal v-if="modal === 'incident'" title="Registrar incidencia" kicker="NUEVA INCIDENCIA · A TU NOMBRE" @close="modal = null">
      <NewIncidentForm cancelable @created="incidentCreated" @cancel="modal = null" />
    </AppModal>

    <AppModal v-if="modal === 'department'" title="Nuevo departamento" kicker="ORGANIZACIÓN" @close="modal = null">
      <form class="incident-form modal-form" @submit.prevent="submitDepartment">
        <label>Nombre<input v-model="newDepartment.nombre" maxlength="80" placeholder="Ej. Infraestructura" required /></label>
        <label><span class="label-text">Descripción <span class="optional">(opcional)</span></span><input v-model="newDepartment.descripcion" maxlength="200" placeholder="Qué atiende este departamento" /></label>
        <p v-if="error" class="form-notice error" role="alert">{{ error }}</p>
        <footer class="details-footer"><button type="button" class="details-done secondary-button" @click="modal = null">Cancelar</button><button type="submit" class="details-done">Crear departamento</button></footer>
      </form>
    </AppModal>

    <AppModal v-if="modal === 'category'" title="Nueva categoría" kicker="CLASIFICACIÓN" @close="modal = null">
      <form class="incident-form modal-form" @submit.prevent="submitCategory">
        <label>Nombre<input v-model="newCategory.nombre" maxlength="80" placeholder="Ej. Impresoras" required /></label>
        <label>Departamento<select v-model="newCategory.idDepartamento" required><option value="">Seleccione...</option><option v-for="d in catalogs.departamentos" :key="d.id" :value="d.id">{{ d.nombre }}</option></select></label>
        <label><span class="label-text">Descripción <span class="optional">(opcional; ayuda al solicitante a elegir)</span></span><input v-model="newCategory.descripcion" maxlength="200" placeholder="Qué tipo de problemas entran en esta categoría" /></label>
        <p v-if="error" class="form-notice error" role="alert">{{ error }}</p>
        <footer class="details-footer"><button type="button" class="details-done secondary-button" @click="modal = null">Cancelar</button><button type="submit" class="details-done">Crear categoría</button></footer>
      </form>
    </AppModal>

    <AppModal v-if="modal === 'user'" :title="newUser.role === 'agent' ? 'Nuevo agente' : 'Nuevo usuario'" kicker="ACCESOS" @close="modal = null">
      <form class="incident-form modal-form" @submit.prevent="submitUser">
        <div class="form-grid compact">
          <label>Nombre completo<input v-model="newUser.nombre" maxlength="100" required /></label>
          <label>Correo<input v-model="newUser.correo" type="email" maxlength="120" autocomplete="off" required /></label>
          <label>Contraseña inicial<input v-model="newUser.password" type="password" minlength="8" autocomplete="new-password" required /></label>
          <label>Rol<select v-model="newUser.role"><option v-for="r in ROLES" :key="r.key" :value="r.key">{{ r.label }}</option></select></label>
          <label class="form-full"><span class="label-text">Departamento <span v-if="newUser.role !== 'agent'" class="optional">(opcional)</span></span>
            <select v-model="newUser.idDepartamento" :required="newUser.role === 'agent'"><option value="">Ninguno</option><option v-for="d in catalogs.departamentos" :key="d.id" :value="d.id">{{ d.nombre }}</option></select>
          </label>
        </div>
        <p v-if="error" class="form-notice error" role="alert">{{ error }}</p>
        <footer class="details-footer"><button type="button" class="details-done secondary-button" @click="modal = null">Cancelar</button><button type="submit" class="details-done">Crear {{ newUser.role === 'agent' ? 'agente' : 'usuario' }}</button></footer>
      </form>
    </AppModal>

    <!-- ---------- Ventanas para editar ---------- -->
    <div v-if="editingDepartment" class="details-backdrop" @click.self="editingDepartment = null">
      <section class="details-panel" role="dialog" aria-modal="true" aria-label="Editar departamento">
        <header class="details-header"><div><span class="details-kicker">DEPARTAMENTO</span><h2>Editar {{ editingDepartment.nombre }}</h2></div><button class="details-close" @click="editingDepartment = null">×</button></header>
        <form class="edit-form" @submit.prevent="saveDepartment">
          <label>Nombre<input v-model="editingDepartment.nombre" maxlength="80" required /></label>
          <label><span class="label-text">Descripción <span class="optional">(opcional)</span></span><input v-model="editingDepartment.descripcion" maxlength="200" /></label>
          <footer class="details-footer"><button type="button" class="details-done secondary-button" @click="editingDepartment = null">Cancelar</button><button type="submit" class="details-done">Guardar cambios</button></footer>
        </form>
      </section>
    </div>

    <div v-if="editingCategory" class="details-backdrop" @click.self="editingCategory = null">
      <section class="details-panel" role="dialog" aria-modal="true" aria-label="Editar categoría">
        <header class="details-header"><div><span class="details-kicker">CATEGORÍA</span><h2>Editar {{ editingCategory.nombre }}</h2></div><button class="details-close" @click="editingCategory = null">×</button></header>
        <form class="edit-form" @submit.prevent="saveCategory">
          <div class="form-grid compact">
            <label>Nombre<input v-model="editingCategory.nombre" maxlength="80" required /></label>
            <label>Departamento
              <select v-model="editingCategory.idDepartamento" :disabled="editingCategory.incidencias > 0" required><option v-for="d in catalogs.departamentos" :key="d.id" :value="d.id">{{ d.nombre }}</option></select>
            </label>
          </div>
          <p v-if="editingCategory.incidencias > 0" class="section-note">Tiene {{ editingCategory.incidencias }} incidencia(s): no se puede mover a otro departamento.</p>
          <label><span class="label-text">Descripción <span class="optional">(opcional)</span></span><input v-model="editingCategory.descripcion" maxlength="200" /></label>
          <footer class="details-footer"><button type="button" class="details-done secondary-button" @click="editingCategory = null">Cancelar</button><button type="submit" class="details-done">Guardar cambios</button></footer>
        </form>
      </section>
    </div>

    <div v-if="editingUser" class="details-backdrop" @click.self="editingUser = null">
      <section class="details-panel" role="dialog" aria-modal="true" aria-label="Editar usuario">
        <header class="details-header"><div><span class="details-kicker">USUARIO</span><h2>Editar {{ editingUser.nombre }}</h2></div><button class="details-close" @click="editingUser = null">×</button></header>
        <form class="edit-form" @submit.prevent="saveUser">
          <div class="form-grid compact">
            <label>Nombre<input v-model="editingUser.nombre" maxlength="100" required /></label>
            <label>Correo<input v-model="editingUser.correo" type="email" maxlength="120" required /></label>
            <label>Rol<select v-model="editingUser.role" :disabled="editingUser.id === user?.id"><option v-for="r in ROLES" :key="r.key" :value="r.key">{{ r.label }}</option></select></label>
            <label>Departamento<select v-model="editingUser.idDepartamento" :required="editingUser.role === 'agent'"><option value="">Ninguno</option><option v-for="d in catalogs.departamentos" :key="d.id" :value="d.id">{{ d.nombre }}</option></select></label>
          </div>
          <label><span class="label-text">Nueva contraseña <span class="optional">(déjala vacía para no cambiarla; cerrará sus sesiones abiertas)</span></span><input v-model="editingUser.password" type="password" minlength="8" autocomplete="new-password" /></label>
          <footer class="details-footer"><button type="button" class="details-done secondary-button" @click="editingUser = null">Cancelar</button><button type="submit" class="details-done">Guardar cambios</button></footer>
        </form>
      </section>
    </div>
  </main>
</template>
