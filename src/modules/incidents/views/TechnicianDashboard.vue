<script setup>
import { computed, ref } from 'vue'
import TechnicianFramework from '../../technician/framework.vue'
import '../styles/RoleViews.css'
import { getIncidents, saveIncidents, technicians } from '../../../services/IncidentService.js'
import { getSession } from '../../../services/AuthService.js'

const session = getSession()
const technicianId = session?.technicianId || 1
const technician = technicians.find((item) => item.id === technicianId) || technicians[0]
const incidents = ref(getIncidents())
const selectedId = ref(null)
const updateText = ref('')
const notice = ref('')

const assignments = computed(() => incidents.value.filter((incident) => incident.technicianId === technician.id))
const activeAssignments = computed(() => assignments.value.filter((incident) => incident.status !== 'Resuelta'))
const selectedIncident = computed(() => assignments.value.find((incident) => incident.id === selectedId.value))

function setStatus(incident, status) {
  incident.status = status
  incident.updates ||= []
  incident.updates.unshift({ date: 'Ahora', text: `Estado actualizado a ${status}.` })
  saveIncidents(incidents.value)
  notice.value = `La incidencia #${incident.id} fue actualizada.`
}

function addUpdate() {
  if (!selectedIncident.value || !updateText.value.trim()) return
  selectedIncident.value.updates ||= []
  selectedIncident.value.updates.unshift({ date: 'Ahora', text: updateText.value.trim() })
  if (selectedIncident.value.status === 'Pendiente') selectedIncident.value.status = 'En proceso'
  saveIncidents(incidents.value)
  updateText.value = ''
  notice.value = 'Seguimiento guardado correctamente.'
}
</script>

<template>
  <TechnicianFramework>
    <header id="assignments" class="role-header">
      <div><p class="eyebrow">MI ÁREA DE TRABAJO</p><h1>Hola, {{ technician.name }}</h1><p>Consulta y da seguimiento a las incidencias que tienes asignadas.</p></div>
      <div class="header-stat"><strong>{{ activeAssignments.length }}</strong><span>activas</span></div>
    </header>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>

    <section class="summary-grid" aria-label="Resumen de asignaciones">
      <article><span>Asignadas</span><strong>{{ assignments.length }}</strong></article>
      <article><span>En proceso</span><strong>{{ assignments.filter(i => i.status === 'En proceso').length }}</strong></article>
      <article><span>Resueltas</span><strong>{{ assignments.filter(i => i.status === 'Resuelta').length }}</strong></article>
    </section>

    <section class="role-card">
      <div class="section-title"><div><p class="eyebrow">BANDEJA DE TRABAJO</p><h2>Mis incidencias asignadas</h2></div><span>{{ technician.specialty }}</span></div>
      <div class="ticket-list">
        <article v-for="incident in assignments" :key="incident.id" class="ticket-row">
          <div class="ticket-main"><strong>#{{ incident.id }} · {{ incident.title }}</strong><small>{{ incident.category }} · Reportada por {{ incident.reporter || 'Usuario' }} · {{ incident.createdAt }}</small></div>
          <span class="pill" :class="incident.status.toLowerCase().replace(' ', '-')">{{ incident.status }}</span>
          <select :value="incident.status" aria-label="Cambiar estado" @change="setStatus(incident, $event.target.value)"><option>Pendiente</option><option>En proceso</option><option>Resuelta</option></select>
          <button class="secondary" type="button" @click="selectedId = incident.id">Ver y dar seguimiento</button>
        </article>
        <p v-if="!assignments.length" class="empty">No tienes incidencias asignadas en este momento.</p>
      </div>
    </section>

    <section v-if="selectedIncident" id="tracking" class="role-card tracking-card">
      <div class="section-title"><div><p class="eyebrow">SEGUIMIENTO</p><h2>#{{ selectedIncident.id }} · {{ selectedIncident.title }}</h2></div><button class="text-action" type="button" @click="selectedId = null">Cerrar</button></div>
      <p class="description">{{ selectedIncident.description }}</p>
      <form class="update-form" @submit.prevent="addUpdate"><label>Registrar avance<textarea v-model="updateText" placeholder="Describe la revisión, acción realizada o próxima medida..." required /></label><button class="primary" type="submit">Guardar seguimiento</button></form>
      <div class="timeline"><article v-for="(update, index) in selectedIncident.updates || []" :key="`${update.date}-${index}`"><span>{{ update.date }}</span><p>{{ update.text }}</p></article><p v-if="!(selectedIncident.updates || []).length" class="empty">Aún no hay actualizaciones registradas.</p></div>
    </section>
  </TechnicianFramework>
</template>
