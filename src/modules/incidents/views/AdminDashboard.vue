<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import '../styles/AdminDashboard.css'
import IncidentDetail from '../components/IncidentDetail.vue'
import { getSession, logout } from '../../../services/AuthService.js'
import {
  categoriesByDepartment, createIncident, createUser, formatDate, getAgents, getCatalogs, getIncidents, getUsers,
  initials, replaceIncident, slug, updateUser
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
const activeSection = ref('panel')
const notice = ref('')
const error = ref('')
const selectedId = ref(null)

const search = ref('')
const statusFilter = ref('abiertas')
const departmentFilter = ref('')

const emptyIncident = () => ({ titulo: '', descripcion: '', idCategoria: '', idPrioridad: catalogs.value.prioridades.find((p) => p.nombre === 'Media')?.id ?? '' })
const newIncident = ref(emptyIncident())
const emptyUser = () => ({ nombre: '', correo: '', password: '', role: 'applicant', idDepartamento: '' })
const newUser = ref(emptyUser())
const editingUser = ref(null)

const categoryGroups = computed(() => categoriesByDepartment(catalogs.value.categorias))
const open = computed(() => incidents.value.filter((i) => !i.estadoFinal && i.estado !== 'Resuelto'))
const unassigned = computed(() => open.value.filter((i) => !i.agenteId))
const late = computed(() => incidents.value.filter((i) => i.sla.resolucionVencida))
const filteredIncidents = computed(() => {
  const term = search.value.trim().toLowerCase()
  return incidents.value.filter((i) => {
    if (statusFilter.value === 'abiertas' && (i.estadoFinal || i.estado === 'Resuelto')) return false
    if (statusFilter.value === 'vencidas' && !i.sla.resolucionVencida) return false
    if (!['abiertas', 'vencidas', 'todas'].includes(statusFilter.value) && i.estado !== statusFilter.value) return false
    if (departmentFilter.value && i.departamentoId !== Number(departmentFilter.value)) return false
    return !term || [i.id, i.titulo, i.categoria, i.solicitante, i.agente].join(' ').toLowerCase().includes(term)
  })
})
const agentsByDepartment = computed(() =>
  catalogs.value.departamentos.map((d) => ({ ...d, agents: agents.value.filter((a) => a.departamentoId === d.id) }))
)

function show(message) { error.value = ''; notice.value = message }
function fail(err) { notice.value = ''; error.value = err.message || 'Ocurrió un error inesperado.' }

async function loadData() {
  try {
    const [catalog, incidentList, agentList, userList] = await Promise.all([getCatalogs(), getIncidents(), getAgents(), getUsers()])
    catalogs.value = catalog
    incidents.value = incidentList
    agents.value = agentList
    users.value = userList
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

function onChanged(incident, id) {
  replaceIncident(incidents.value, incident, id)
  refreshAgents()
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

function goTo(section) { activeSection.value = section; document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
async function handleLogout() { await logout(); router.push({ name: 'Landing' }) }

onMounted(loadData)
</script>

<template>
  <main class="dashboard admin-dashboard">
    <aside class="dashboard-sidebar">
      <div class="sidebar-brand"><span class="brand-mark">E</span><div><h2>ETicket</h2><span>Administración · UTH</span></div></div>
      <nav class="sidebar-nav" aria-label="Navegación de administración">
        <button class="nav-item" :class="{ active: activeSection === 'panel' }" @click="goTo('panel')">⌂ Panel principal</button>
        <button class="nav-item" :class="{ active: activeSection === 'incidents' }" @click="goTo('incidents')">▤ Incidencias</button>
        <button class="nav-item" :class="{ active: activeSection === 'new-incident' }" @click="goTo('new-incident')">＋ Registrar incidencia</button>
        <button class="nav-item" :class="{ active: activeSection === 'agents' }" @click="goTo('agents')">♙ Agentes</button>
        <button class="nav-item" :class="{ active: activeSection === 'users' }" @click="goTo('users')">⚙ Usuarios</button>
      </nav>
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
        <article class="stat-card success"><span>Agentes activos</span><strong>{{ agents.length }}</strong><small>{{ users.length }} usuarios en total</small></article>
      </section>

      <section id="incidents" class="card incident-management section-anchor">
        <div class="section-heading management-heading"><div><p class="eyebrow">SEGUIMIENTO</p><h2>Incidencias</h2></div><span>{{ filteredIncidents.length }} de {{ incidents.length }}</span></div>
        <div class="toolbar">
          <input v-model="search" type="search" placeholder="Buscar por número, título, solicitante o agente" aria-label="Buscar incidencias" />
          <select v-model="departmentFilter" aria-label="Filtrar por departamento"><option value="">Todos los departamentos</option><option v-for="d in catalogs.departamentos" :key="d.id" :value="d.id">{{ d.nombre }}</option></select>
          <select v-model="statusFilter" aria-label="Filtrar por estado">
            <option value="abiertas">Abiertas</option><option value="vencidas">SLA vencido</option><option value="todas">Todas</option>
            <option v-for="e in catalogs.estados" :key="e.id" :value="e.nombre">{{ e.nombre }}</option>
          </select>
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
              <td class="table-actions"><button class="text-button" @click="selectedId = incident.id">Ver / gestionar</button></td>
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

      <section id="users" class="card section-anchor">
        <div class="section-heading"><div><p class="eyebrow">ACCESOS</p><h2>Usuarios</h2></div><span class="section-note">{{ users.length }} cuenta(s)</span></div>
        <form class="incident-form user-form" @submit.prevent="submitUser"><div class="form-grid">
          <label>Nombre completo<input v-model="newUser.nombre" maxlength="100" required /></label>
          <label>Correo<input v-model="newUser.correo" type="email" maxlength="120" autocomplete="off" required /></label>
          <label>Contraseña inicial<input v-model="newUser.password" type="password" minlength="8" autocomplete="new-password" required /></label>
          <label>Rol<select v-model="newUser.role"><option v-for="r in ROLES" :key="r.key" :value="r.key">{{ r.label }}</option></select></label>
          <label>Departamento <span v-if="newUser.role !== 'agent'" class="optional">(opcional)</span>
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

    <IncidentDetail v-if="selectedId" :incident-id="selectedId" :user="user" @close="selectedId = null" @changed="onChanged" />

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
          <label>Nueva contraseña <span class="optional">(déjala vacía para no cambiarla; cerrará sus sesiones abiertas)</span><input v-model="editingUser.password" type="password" minlength="8" autocomplete="new-password" /></label>
          <footer class="details-footer"><button type="button" class="details-done secondary-button" @click="editingUser = null">Cancelar</button><button type="submit" class="details-done">Guardar cambios</button></footer>
        </form>
      </section>
    </div>
  </main>
</template>
