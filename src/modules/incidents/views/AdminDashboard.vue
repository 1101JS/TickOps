<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import '../styles/AdminDashboard.css'
import { logout } from '../../../services/AuthService.js'
import { getIncidents, getLeastBusyTechnicianId, saveIncidents } from '../../../services/IncidentService.js'

const router = useRouter()
const technicians = ref([
  { id: 1, name: 'Ana López', specialty: 'Hardware', email: 'ana.lopez@uth.hn', initials: 'AL', workload: 0 },
  { id: 2, name: 'Carlos Mejía', specialty: 'Software', email: 'carlos.mejia@uth.hn', initials: 'CM', workload: 0 },
  { id: 3, name: 'María García', specialty: 'Redes', email: 'maria.garcia@uth.hn', initials: 'MG', workload: 0 },
  { id: 4, name: 'José Rivera', specialty: 'Soporte general', email: 'jose.rivera@uth.hn', initials: 'JR', workload: 0 }
])
const incidents = ref(getIncidents())
const newIncident = ref({ title: '', category: '', priority: 'Media', description: '', technicianId: null })
const selectedIncident = ref(null)
const editingIncident = ref(null)
const activeSection = ref('panel')
const notice = ref('')
const search = ref('')
const statusFilter = ref('Todos')
function technicianName(id) { return technicians.value.find(t => t.id === id)?.name || 'Sin asignar' }
function syncWorkload() { technicians.value.forEach(t => { t.workload = incidents.value.filter(i => i.technicianId === t.id && i.status !== 'Resuelta').length }) }
syncWorkload()
watch(incidents, items => saveIncidents(items), { deep: true })
const filteredIncidents = computed(() => { const term = search.value.trim().toLowerCase(); return incidents.value.filter(i => (statusFilter.value === 'Todos' || i.status === statusFilter.value) && (!term || [i.id, i.title, i.category, technicianName(i.technicianId)].join(' ').toLowerCase().includes(term))) })
const openIncidents = computed(() => incidents.value.filter(i => i.status !== 'Resuelta').length)
const unassignedIncidents = computed(() => incidents.value.filter(i => !i.technicianId && i.status !== 'Resuelta').length)
function submitIncident() {
  const id = Math.max(0, ...incidents.value.map(i => i.id)) + 1
  const assignedTechnicianId = newIncident.value.technicianId ? Number(newIncident.value.technicianId) : getLeastBusyTechnicianId(incidents.value)
  incidents.value.unshift({ id, title: newIncident.value.title.trim(), category: newIncident.value.category, priority: newIncident.value.priority, description: newIncident.value.description.trim(), technicianId: assignedTechnicianId, status: 'Pendiente', createdAt: new Intl.DateTimeFormat('es-HN', { dateStyle: 'medium' }).format(new Date()), reporter: 'Administrador', updates: [{ date: 'Ahora', text: 'Incidencia registrada y asignada automáticamente.' }] })
  syncWorkload(); newIncident.value = { title: '', category: '', priority: 'Media', description: '', technicianId: null }; notice.value = `Incidencia #${id} registrada y asignada a ${technicianName(assignedTechnicianId)}.`; goTo('incidents')
}
function assignTechnician(incident, technicianId) { incident.technicianId = technicianId ? Number(technicianId) : null; if (incident.status === 'Pendiente' && technicianId) incident.status = 'En proceso'; syncWorkload(); notice.value = technicianId ? `${technicianName(Number(technicianId))} fue asignado a la incidencia #${incident.id}.` : `Se removió el técnico de la incidencia #${incident.id}.` }
function openEditor(incident) { editingIncident.value = { ...incident } }
function saveIncident() { const index = incidents.value.findIndex(i => i.id === editingIncident.value.id); incidents.value[index] = { ...editingIncident.value, technicianId: editingIncident.value.technicianId ? Number(editingIncident.value.technicianId) : null }; selectedIncident.value = { ...incidents.value[index] }; syncWorkload(); notice.value = `Incidencia #${editingIncident.value.id} actualizada.`; editingIncident.value = null }
function goTo(section) { activeSection.value = section; document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
function handleLogout() { logout(); router.push({ name: 'Landing' }) }
</script>

<template>
  <main class="dashboard admin-dashboard">
    <aside class="dashboard-sidebar">
      <div class="sidebar-brand"><span class="brand-mark">E</span><div><h2>ETicket</h2><span>Administración · UTH</span></div></div>
      <nav class="sidebar-nav" aria-label="Navegación de administración">
        <button class="nav-item" :class="{ active: activeSection === 'panel' }" @click="goTo('panel')">⌂ Panel principal</button>
        <button class="nav-item" :class="{ active: activeSection === 'new-incident' }" @click="goTo('new-incident')">＋ Registrar incidencia</button>
        <button class="nav-item" :class="{ active: activeSection === 'incidents' }" @click="goTo('incidents')">▤ Administrar incidencias</button>
        <button class="nav-item" :class="{ active: activeSection === 'technicians' }" @click="goTo('technicians')">♙ Técnicos</button>
      </nav>
      <button class="logout-button" @click="handleLogout">Cerrar sesión</button>
    </aside>

    <section class="dashboard-content">
      <header id="panel" class="dashboard-header"><div><p class="eyebrow">CENTRO DE CONTROL</p><h1>Panel principal</h1><p>Registra, da seguimiento y asigna las incidencias de soporte.</p></div><button class="primary-button header-action" @click="goTo('new-incident')">+ Nueva incidencia</button></header>
      <p v-if="notice" class="form-notice" role="status">{{ notice }}</p>
      <section class="stats-grid" aria-label="Resumen de incidencias">
        <article class="stat-card"><span>Incidencias activas</span><strong>{{ openIncidents }}</strong><small>En espera o en proceso</small></article>
        <article class="stat-card warning"><span>Sin asignar</span><strong>{{ unassignedIncidents }}</strong><small>Requieren un técnico</small></article>
        <article class="stat-card success"><span>Resueltas</span><strong>{{ incidents.filter(i => i.status === 'Resuelta').length }}</strong><small>Histórico disponible</small></article>
        <article class="stat-card"><span>Técnicos disponibles</span><strong>{{ technicians.filter(t => t.workload === 0).length }}</strong><small>Sin carga activa</small></article>
      </section>
      <section id="new-incident" class="card incident-form section-anchor">
        <div class="section-heading"><div><p class="eyebrow">REGISTRO</p><h2>Registrar nueva incidencia</h2></div><span class="section-note">Los campos marcados son obligatorios.</span></div>
        <form @submit.prevent="submitIncident"><div class="form-grid">
          <label>Título<input v-model="newIncident.title" placeholder="Breve descripción del problema" required /></label>
          <label>Categoría<select v-model="newIncident.category" required><option value="">Seleccione...</option><option>Hardware</option><option>Software</option><option>Redes</option><option>Accesos</option><option>Otro</option></select></label>
          <label>Prioridad<select v-model="newIncident.priority"><option>Baja</option><option>Media</option><option>Alta</option></select></label>
          <label>Técnico inicial <span class="optional">(opcional)</span><select v-model="newIncident.technicianId"><option :value="null">Sin asignar</option><option v-for="technician in technicians" :key="technician.id" :value="technician.id">{{ technician.name }} · {{ technician.specialty }}</option></select></label>
          <label class="form-full">Descripción<textarea v-model="newIncident.description" placeholder="Describe el problema, ubicación y cualquier detalle relevante..." required /></label>
        </div><button type="submit" class="primary-button">Registrar incidencia</button></form>
      </section>
      <section id="incidents" class="card incident-management section-anchor">
        <div class="section-heading management-heading"><div><p class="eyebrow">SEGUIMIENTO</p><h2>Administrar incidencias</h2></div><span>{{ filteredIncidents.length }} de {{ incidents.length }} incidencias</span></div>
        <div class="toolbar"><input v-model="search" type="search" placeholder="Buscar por código, título o técnico" aria-label="Buscar incidencias" /><select v-model="statusFilter" aria-label="Filtrar por estado"><option>Todos</option><option>Pendiente</option><option>En proceso</option><option>Resuelta</option></select></div>
        <div class="incident-table-wrap"><table class="incident-table"><thead><tr><th>Incidencia</th><th>Prioridad</th><th>Estado</th><th>Técnico asignado</th><th>Acciones</th></tr></thead><tbody>
          <tr v-for="incident in filteredIncidents" :key="incident.id"><td><strong>#{{ incident.id }} · {{ incident.title }}</strong><small>{{ incident.category }} · {{ incident.createdAt }}</small></td><td><span class="priority" :class="incident.priority.toLowerCase()">{{ incident.priority }}</span></td><td><span class="status-pill" :class="incident.status.toLowerCase().replace(' ', '-')">{{ incident.status }}</span></td><td><select class="assignment-select" :value="incident.technicianId" @change="assignTechnician(incident, $event.target.value)"><option :value="null">Sin asignar</option><option v-for="technician in technicians" :key="technician.id" :value="technician.id">{{ technician.name }}</option></select></td><td class="table-actions"><button class="text-button" @click="selectedIncident = { ...incident }">Ver</button><button class="text-button" @click="openEditor(incident)">Editar</button></td></tr>
          <tr v-if="!filteredIncidents.length"><td colspan="5" class="empty-state">No se encontraron incidencias con esos criterios.</td></tr>
        </tbody></table></div>
      </section>
      <section id="technicians" class="card technicians-section section-anchor"><div class="section-heading"><div><p class="eyebrow">EQUIPO DE SOPORTE</p><h2>Técnicos</h2></div><span class="section-note">Asigna, cambia o remueve técnicos desde cada incidencia.</span></div><div class="technician-grid"><article v-for="technician in technicians" :key="technician.id" class="technician-card"><div class="technician-avatar">{{ technician.initials }}</div><div class="technician-info"><h3>{{ technician.name }}</h3><p>{{ technician.specialty }}</p><small>{{ technician.email }}</small></div><span class="workload" :class="{ available: technician.workload === 0 }">{{ technician.workload === 0 ? 'Disponible' : `${technician.workload} activa${technician.workload > 1 ? 's' : ''}` }}</span></article></div></section>
    </section>
    <div v-if="selectedIncident" class="details-backdrop" @click.self="selectedIncident = null"><section class="details-panel" role="dialog" aria-modal="true"><header class="details-header"><div><span class="details-kicker">FICHA DE SEGUIMIENTO</span><h2>Incidencia #{{ selectedIncident.id }}</h2></div><button class="details-close" @click="selectedIncident = null">×</button></header><div class="details-summary"><div class="details-summary-icon">◈</div><div><h3>{{ selectedIncident.title }}</h3><p>Registrada el {{ selectedIncident.createdAt }}</p></div><span class="status-pill" :class="selectedIncident.status.toLowerCase().replace(' ', '-')">{{ selectedIncident.status }}</span></div><div class="details-grid"><article class="details-field"><span>Categoría</span><strong>{{ selectedIncident.category }}</strong></article><article class="details-field"><span>Prioridad</span><strong>{{ selectedIncident.priority }}</strong></article><article class="details-field"><span>Técnico asignado</span><strong>{{ technicianName(selectedIncident.technicianId) }}</strong></article><article class="details-field"><span>Estado actual</span><strong>{{ selectedIncident.status }}</strong></article></div><section class="details-description"><h3>Descripción del problema</h3><p>{{ selectedIncident.description }}</p></section><footer class="details-footer"><button class="details-done secondary-button" @click="openEditor(selectedIncident); selectedIncident = null">Editar incidencia</button><button class="details-done" @click="selectedIncident = null">Cerrar</button></footer></section></div>
    <div v-if="editingIncident" class="details-backdrop" @click.self="editingIncident = null"><section class="details-panel" role="dialog" aria-modal="true"><header class="details-header"><div><span class="details-kicker">ACTUALIZACIÓN</span><h2>Editar incidencia #{{ editingIncident.id }}</h2></div><button class="details-close" @click="editingIncident = null">×</button></header><form class="edit-form" @submit.prevent="saveIncident"><label>Título<input v-model="editingIncident.title" required /></label><div class="form-grid compact"><label>Categoría<select v-model="editingIncident.category"><option>Hardware</option><option>Software</option><option>Redes</option><option>Accesos</option><option>Otro</option></select></label><label>Prioridad<select v-model="editingIncident.priority"><option>Baja</option><option>Media</option><option>Alta</option></select></label><label>Estado<select v-model="editingIncident.status"><option>Pendiente</option><option>En proceso</option><option>Resuelta</option></select></label><label>Técnico<select v-model="editingIncident.technicianId"><option :value="null">Sin asignar</option><option v-for="technician in technicians" :key="technician.id" :value="technician.id">{{ technician.name }}</option></select></label></div><label>Descripción<textarea v-model="editingIncident.description" required /></label><footer class="details-footer"><button type="button" class="details-done secondary-button" @click="editingIncident = null">Cancelar</button><button type="submit" class="details-done">Guardar cambios</button></footer></form></section></div>
  </main>
</template>
