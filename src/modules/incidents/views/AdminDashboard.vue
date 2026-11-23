<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import '../styles/AdminDashboard.css'
import ThemeSwitcher from '../../../components/ThemeSwitcher.vue'
import AdminViewSwitcher from '../../shared/AdminViewSwitcher.vue'
import { getSession, logout } from '../../../services/AuthService.js'
import { exportIncidentsToExcel, exportIncidentsToPdf } from '../../../services/ExportService.js'
import {
  categoriesByDepartment, createCategory, createDepartment, createIncident, createUser, deleteCategory, deleteDepartment, formatDate, getAgents,
  getCatalogs, getCategories, getDepartments, getIncidents, getUsers, initials, slug, updateCategory, updateDepartment, updateUser
} from '../../../services/IncidentService.js'

const ROLES = [
  { key: 'admin', label: 'Administrador' },
  { key: 'agent', label: 'Agente' },
  { key: 'applicant', label: 'Solicitante' }
]

const router = useRouter()
const user = getSession()
const catalogs = ref({ departamentos: [], categorias: [], prioridades: [], estados: [] })
const incidents = ref([])
const agents = ref([])
const users = ref([])
const categories = ref([])
const departments = ref([])
const activeSection = ref('panel')
const notice = ref('')
const error = ref('')

const search = ref('')
const statusFilter = ref('abiertas')
const departmentFilter = ref('')
const priorityFilter = ref('')
const categoryFilter = ref('')
const dateFrom = ref('')
const dateTo = ref('')

const emptyIncident = () => ({ titulo: '', descripcion: '', idCategoria: '', idPrioridad: catalogs.value.prioridades.find((p) => p.nombre === 'Media')?.id ?? '' })
const newIncident = ref(emptyIncident())
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

const categoryGroups = computed(() => categoriesByDepartment(catalogs.value.categorias))
const open = computed(() => incidents.value.filter((i) => !i.estadoFinal && i.estado !== 'Resuelto'))
const unassigned = computed(() => open.value.filter((i) => !i.agenteId))
const late = computed(() => incidents.value.filter((i) => i.sla.resolucionVencida))
const solved = computed(() => incidents.value.filter((i) => ['Resuelto', 'Cerrado'].includes(i.estado)))
// Categorías del filtro: las del departamento elegido (o todas, agrupadas por departamento).
const filterCategoryGroups = computed(() =>
  categoriesByDepartment(catalogs.value.categorias.filter((c) => !departmentFilter.value || c.departamentoId === Number(departmentFilter.value)))
)
const activeFilters = computed(() =>
  Boolean(search.value || departmentFilter.value || priorityFilter.value || categoryFilter.value || dateFrom.value || dateTo.value || statusFilter.value !== 'abiertas')
)
const filteredIncidents = computed(() => {
  const term = search.value.trim().toLowerCase()
  // Las fechas del filtro son días locales completos: desde las 00:00 del inicio hasta las 23:59 del fin.
  const from = dateFrom.value ? new Date(`${dateFrom.value}T00:00:00`) : null
  const to = dateTo.value ? new Date(`${dateTo.value}T23:59:59.999`) : null
  return incidents.value.filter((i) => {
    if (statusFilter.value === 'abiertas' && (i.estadoFinal || i.estado === 'Resuelto')) return false
    if (statusFilter.value === 'vencidas' && !i.sla.resolucionVencida) return false
    if (!['abiertas', 'vencidas', 'todas'].includes(statusFilter.value) && i.estado !== statusFilter.value) return false
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
  const states = { abiertas: 'Abiertas', vencidas: 'SLA vencido', todas: '' }
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
    if (!newIncident.value.idPrioridad) newIncident.value = emptyIncident()
  } catch (err) { fail(err) }
}

async function refreshAgents() {
  agents.value = await getAgents().catch(() => agents.value)
}

async function submitIncident() {
  try {
    const { idCategoria, idPrioridad, ...fields } = newIncident.value
    const incident = await createIncident({ ...fields, idCategoria: Number(idCategoria), idPrioridad: Number(idPrioridad) })
    incidents.value.unshift(incident)
    newIncident.value = emptyIncident()
    show(`Incidencia #${incident.id} registrada en la cola de ${incident.departamento}.`)
    goTo('incidents')
  } catch (err) { fail(err) }
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

function goTo(section) { activeSection.value = section; document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
async function handleLogout() { await logout(); router.push({ name: 'Landing' }) }

onMounted(loadData)
</script>

<template>
  <main class="dashboard admin-dashboard">
    <aside class="dashboard-sidebar">
      <div class="sidebar-brand"><span class="brand-mark">T</span><div><h2>TickOps</h2><span>Administración</span></div></div>
      <AdminViewSwitcher />
      <nav class="sidebar-nav" aria-label="Navegación de administración">
        <button class="nav-item" :class="{ active: activeSection === 'panel' }" @click="goTo('panel')">⌂ Panel principal</button>
        <button class="nav-item" :class="{ active: activeSection === 'incidents' }" @click="goTo('incidents')">▤ Incidencias</button>
        <button class="nav-item" :class="{ active: activeSection === 'new-incident' }" @click="goTo('new-incident')">＋ Registrar incidencia</button>
        <button class="nav-item" :class="{ active: activeSection === 'agents' }" @click="goTo('agents')">♙ Agentes</button>
        <button class="nav-item" :class="{ active: activeSection === 'departments' }" @click="goTo('departments')">◫ Departamentos</button>
        <button class="nav-item" :class="{ active: activeSection === 'categories' }" @click="goTo('categories')">▦ Categorías</button>
        <button class="nav-item" :class="{ active: activeSection === 'users' }" @click="goTo('users')">⚙ Usuarios</button>
      </nav>
      <div class="sidebar-theme"><ThemeSwitcher /></div>
      <button class="logout-button" @click="handleLogout">Cerrar sesión</button>
    </aside>

    <section class="dashboard-content">
      <header id="panel" class="dashboard-header">
        <div><p class="eyebrow">CENTRO DE CONTROL</p><h1>Panel principal</h1><p>Hola, {{ user?.nombre }}. Supervisa las incidencias de todos los departamentos.</p></div>
        <button class="primary-button header-action" @click="goTo('new-incident')">+ Nueva incidencia</button>
      </header>
      <p v-if="error" class="form-notice error" role="alert">{{ error }}</p>
      <p v-else-if="notice" class="form-notice" role="status">{{ notice }}</p>

      <section class="stats-grid" aria-label="Resumen de incidencias">
        <article class="stat-card"><span>Incidencias abiertas</span><strong>{{ open.length }}</strong><small>Pendientes o en proceso</small></article>
        <article class="stat-card warning"><span>Sin asignar</span><strong>{{ unassigned.length }}</strong><small>Esperando agente</small></article>
        <article class="stat-card danger"><span>SLA vencido</span><strong>{{ late.length }}</strong><small>Fuera del tiempo de resolución</small></article>
        <article class="stat-card solved"><span>Resueltas</span><strong>{{ solved.length }}</strong><small>Resueltas o cerradas · {{ incidents.length }} en total</small></article>
        <article class="stat-card success"><span>Agentes activos</span><strong>{{ agents.length }}</strong><small>{{ users.length }} usuarios en total</small></article>
      </section>

      <section id="incidents" class="card incident-management section-anchor">
        <div class="section-heading management-heading">
          <div><p class="eyebrow">SEGUIMIENTO</p><h2>Incidencias</h2></div>
          <div class="export-actions">
            <span>{{ filteredIncidents.length }} de {{ incidents.length }}</span>
            <button type="button" class="secondary-button export-button" :disabled="Boolean(exporting)" @click="exportReport('excel')">{{ exporting === 'excel' ? 'Generando…' : 'Exportar Excel' }}</button>
            <button type="button" class="secondary-button export-button" :disabled="Boolean(exporting)" @click="exportReport('pdf')">{{ exporting === 'pdf' ? 'Generando…' : 'Exportar PDF' }}</button>
          </div>
        </div>
        <div class="toolbar">
          <input v-model="search" type="search" placeholder="Buscar por número, título, solicitante o agente" aria-label="Buscar incidencias" />
          <select v-model="statusFilter" aria-label="Filtrar por estado">
            <option value="abiertas">Abiertas</option><option value="vencidas">SLA vencido</option><option value="todas">Todos los estados</option>
            <option v-for="e in catalogs.estados" :key="e.id" :value="e.nombre">{{ e.nombre }}</option>
          </select>
          <select v-model="priorityFilter" aria-label="Filtrar por prioridad"><option value="">Todas las prioridades</option><option v-for="p in catalogs.prioridades" :key="p.id" :value="p.id">{{ p.nombre }}</option></select>
        </div>
        <div class="toolbar filter-row">
          <select v-model="departmentFilter" aria-label="Filtrar por departamento"><option value="">Todos los departamentos</option><option v-for="d in catalogs.departamentos" :key="d.id" :value="d.id">{{ d.nombre }}</option></select>
          <select v-model="categoryFilter" aria-label="Filtrar por categoría">
            <option value="">Todas las categorías</option>
            <optgroup v-for="g in filterCategoryGroups" :key="g.departamento" :label="g.departamento"><option v-for="c in g.items" :key="c.id" :value="c.id">{{ c.nombre }}</option></optgroup>
          </select>
          <label class="date-filter">Desde<input v-model="dateFrom" type="date" :max="dateTo || undefined" aria-label="Registradas desde" /></label>
          <label class="date-filter">Hasta<input v-model="dateTo" type="date" :min="dateFrom || undefined" aria-label="Registradas hasta" /></label>
          <button v-if="activeFilters" type="button" class="text-button" @click="clearFilters">Limpiar filtros</button>
        </div>
        <div class="incident-table-wrap"><table class="incident-table">
          <thead><tr><th>Incidencia</th><th>Departamento</th><th>Prioridad</th><th>Estado</th><th>Agente</th><th></th></tr></thead>
          <tbody>
            <tr v-for="incident in filteredIncidents" :key="incident.id">
              <td><strong>#{{ incident.id }} · {{ incident.titulo }}</strong><small>{{ incident.solicitante }} · {{ formatDate(incident.fechaCreacion) }}</small></td>
              <td><strong>{{ incident.departamento }}</strong><small>{{ incident.categoria }}</small></td>
              <td><span class="priority" :class="slug(incident.prioridad)">{{ incident.prioridad }}</span></td>
              <td><span class="status-pill" :class="slug(incident.estado)">{{ incident.estado }}</span><small v-if="incident.sla.resolucionVencida" class="late-text">SLA vencido</small></td>
              <td>{{ incident.agente || 'Sin asignar' }}</td>
              <td class="table-actions"><button class="text-button" @click="openIncident(incident.id)">Ver / gestionar</button></td>
            </tr>
            <tr v-if="!filteredIncidents.length"><td colspan="6" class="empty-state">{{ incidents.length ? 'No hay incidencias con esos filtros.' : 'Todavía no hay incidencias registradas.' }}</td></tr>
          </tbody>
        </table></div>
      </section>

      <section id="new-incident" class="card incident-form section-anchor">
        <div class="section-heading"><div><p class="eyebrow">REGISTRO</p><h2>Registrar nueva incidencia</h2></div><span class="section-note">Quedará a tu nombre como solicitante.</span></div>
        <form @submit.prevent="submitIncident"><div class="form-grid">
          <label>Título<input v-model="newIncident.titulo" maxlength="150" placeholder="Breve descripción del problema" required /></label>
          <label>Categoría<select v-model="newIncident.idCategoria" required><option value="">Seleccione...</option><optgroup v-for="g in categoryGroups" :key="g.departamento" :label="g.departamento"><option v-for="c in g.items" :key="c.id" :value="c.id">{{ c.nombre }}</option></optgroup></select></label>
          <label>Prioridad<select v-model="newIncident.idPrioridad" required><option v-for="p in catalogs.prioridades" :key="p.id" :value="p.id">{{ p.nombre }} · resolver en {{ p.slaResolucionHoras }} h</option></select></label>
          <label class="form-full">Descripción<textarea v-model="newIncident.descripcion" maxlength="5000" placeholder="Describe el problema, ubicación y cualquier detalle relevante..." required /></label>
        </div><button type="submit" class="primary-button">Registrar incidencia</button></form>
      </section>

      <section id="agents" class="card technicians-section section-anchor">
        <div class="section-heading"><div><p class="eyebrow">EQUIPO DE SOPORTE</p><h2>Agentes por departamento</h2></div><span class="section-note">La carga cuenta incidencias pendientes o en proceso.</span></div>
        <div v-for="d in agentsByDepartment" :key="d.id" class="department-block">
          <h3>{{ d.nombre }} <small>{{ d.agents.length }} agente(s)</small></h3>
          <div class="technician-grid">
            <article v-for="agent in d.agents" :key="agent.id" class="technician-card">
              <div class="technician-avatar">{{ initials(agent.nombre) }}</div>
              <div class="technician-info"><h3>{{ agent.nombre }}</h3><small>{{ agent.correo }}</small></div>
              <span class="workload" :class="{ available: agent.carga === 0 }">{{ agent.carga === 0 ? 'Disponible' : `${agent.carga} abierta${agent.carga > 1 ? 's' : ''}` }}</span>
            </article>
          </div>
          <p v-if="!d.agents.length" class="section-note">Sin agentes: sus incidencias no podrán atenderse. Crea uno en Usuarios.</p>
        </div>
      </section>

      <section id="departments" class="card section-anchor">
        <div class="section-heading"><div><p class="eyebrow">ORGANIZACIÓN</p><h2>Departamentos</h2></div><span class="section-note">Cada departamento atiende las incidencias de sus categorías con sus agentes.</span></div>
        <form class="incident-form user-form" @submit.prevent="submitDepartment"><div class="form-grid">
          <label>Nombre<input v-model="newDepartment.nombre" maxlength="80" placeholder="Ej. Infraestructura" required /></label>
          <label class="form-full"><span class="label-text">Descripción <span class="optional">(opcional)</span></span><input v-model="newDepartment.descripcion" maxlength="200" placeholder="Qué atiende este departamento" /></label>
        </div><button type="submit" class="primary-button">Crear departamento</button></form>

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

      <section id="categories" class="card section-anchor">
        <div class="section-heading"><div><p class="eyebrow">CLASIFICACIÓN</p><h2>Categorías</h2></div><span class="section-note">La categoría decide qué departamento atiende cada incidencia.</span></div>
        <form class="incident-form user-form" @submit.prevent="submitCategory"><div class="form-grid">
          <label>Nombre<input v-model="newCategory.nombre" maxlength="80" placeholder="Ej. Impresoras" required /></label>
          <label>Departamento<select v-model="newCategory.idDepartamento" required><option value="">Seleccione...</option><option v-for="d in catalogs.departamentos" :key="d.id" :value="d.id">{{ d.nombre }}</option></select></label>
          <label class="form-full"><span class="label-text">Descripción <span class="optional">(opcional; ayuda al solicitante a elegir)</span></span><input v-model="newCategory.descripcion" maxlength="200" placeholder="Qué tipo de problemas entran en esta categoría" /></label>
        </div><button type="submit" class="primary-button">Crear categoría</button></form>

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

      <section id="users" class="card section-anchor">
        <div class="section-heading"><div><p class="eyebrow">ACCESOS</p><h2>Usuarios</h2></div><span class="section-note">{{ users.length }} cuenta(s)</span></div>
        <form class="incident-form user-form" @submit.prevent="submitUser"><div class="form-grid">
          <label>Nombre completo<input v-model="newUser.nombre" maxlength="100" required /></label>
          <label>Correo<input v-model="newUser.correo" type="email" maxlength="120" autocomplete="off" required /></label>
          <label>Contraseña inicial<input v-model="newUser.password" type="password" minlength="8" autocomplete="new-password" required /></label>
          <label>Rol<select v-model="newUser.role"><option v-for="r in ROLES" :key="r.key" :value="r.key">{{ r.label }}</option></select></label>
          <label><span class="label-text">Departamento <span v-if="newUser.role !== 'agent'" class="optional">(opcional)</span></span>
            <select v-model="newUser.idDepartamento" :required="newUser.role === 'agent'"><option value="">Ninguno</option><option v-for="d in catalogs.departamentos" :key="d.id" :value="d.id">{{ d.nombre }}</option></select>
          </label>
        </div><button type="submit" class="primary-button">Crear usuario</button></form>

        <div class="incident-table-wrap"><table class="incident-table">
          <thead><tr><th>Usuario</th><th>Rol</th><th>Departamento</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            <tr v-for="u in users" :key="u.id" :class="{ inactive: !u.activo }">
              <td><strong>{{ u.nombre }}</strong><small>{{ u.correo }}</small></td>
              <td>{{ u.rol }}</td>
              <td>{{ u.departamento || '—' }}</td>
              <td><span class="status-pill" :class="u.activo ? 'resuelto' : 'cerrado'">{{ u.activo ? 'Activo' : 'Inactivo' }}</span></td>
              <td class="table-actions">
                <button class="text-button" @click="openUserEditor(u)">Editar</button>
                <button v-if="u.id !== user?.id" class="text-button" @click="toggleActive(u)">{{ u.activo ? 'Desactivar' : 'Reactivar' }}</button>
              </td>
            </tr>
          </tbody>
        </table></div>
      </section>
    </section>

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
