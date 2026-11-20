<script setup>
import { computed, onMounted, ref } from 'vue'
import ApplicantFramework from '../../applicant/framework.vue'
import '../styles/RoleViews.css'
import { createIncident, getIncidents } from '../../../services/IncidentService.js'

const incidents = ref([])
const form = ref({ title: '', category: '', priority: 'Media', description: '' })
const notice = ref('')
const selectedId = ref(null)
const sending = ref(false)

// El servidor ya devuelve solo las incidencias del solicitante autenticado.
const myIncidents = computed(() => incidents.value)
const selectedIncident = computed(() => myIncidents.value.find((incident) => incident.id === selectedId.value))

async function loadIncidents() {
  try {
    incidents.value = await getIncidents()
  } catch (error) {
    notice.value = error.message
  }
}

async function submitIncident() {
  if (sending.value) return
  sending.value = true
  try {
    const incident = await createIncident(form.value)
    incidents.value.unshift(incident)
    form.value = { title: '', category: '', priority: 'Media', description: '' }
    notice.value = incident.technicianName
      ? `Tu incidencia #${incident.id} fue enviada y asignada automáticamente a ${incident.technicianName}.`
      : `Tu incidencia #${incident.id} fue enviada. Pronto será asignada a un técnico.`
    selectedId.value = incident.id
  } catch (error) {
    notice.value = error.message
  } finally {
    sending.value = false
  }
}

function technicianName(id) {
  return incidents.value.find((incident) => incident.technicianId === id)?.technicianName || 'Pendiente de asignación'
}

onMounted(loadIncidents)
</script>

<template>
  <ApplicantFramework>
    <header class="role-header">
      <div><p class="eyebrow">PORTAL DE SOPORTE</p><h1>¿Cómo podemos ayudarte?</h1><p>Registra una incidencia y consulta el avance de tus solicitudes.</p></div>
    </header>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>

    <div class="applicant-layout">
      <section id="new-incident" class="role-card">
        <div class="section-title"><div><p class="eyebrow">NUEVO REPORTE</p><h2>Registrar incidencia</h2></div></div>
        <form class="incident-form" @submit.prevent="submitIncident">
          <label>Título<input v-model="form.title" placeholder="Ej. No puedo acceder al sistema" required /></label>
          <div class="two-columns"><label>Categoría<select v-model="form.category" required><option value="">Selecciona una opción</option><option>Hardware</option><option>Software</option><option>Redes</option><option>Accesos</option><option>Otro</option></select></label><label>Prioridad<select v-model="form.priority"><option>Baja</option><option>Media</option><option>Alta</option></select></label></div>
          <label>Descripción<textarea v-model="form.description" placeholder="Indica qué ocurre, dónde sucede y desde cuándo..." required /></label>
          <button class="primary" type="submit" :disabled="sending">{{ sending ? 'Enviando...' : 'Enviar incidencia' }}</button>
        </form>
      </section>

      <section id="my-incidents" class="role-card">
        <div class="section-title"><div><p class="eyebrow">MIS SOLICITUDES</p><h2>Estado de incidencias</h2></div><span>{{ myIncidents.length }} registradas</span></div>
        <div class="ticket-list compact-list"><article v-for="incident in myIncidents" :key="incident.id" class="ticket-row"><div class="ticket-main"><strong>#{{ incident.id }} · {{ incident.title }}</strong><small>{{ incident.category }} · Técnico: {{ technicianName(incident.technicianId) }}</small></div><span class="pill" :class="incident.status.toLowerCase().replace(' ', '-')">{{ incident.status }}</span><button class="secondary" type="button" @click="selectedId = incident.id">Ver detalle</button></article><p v-if="!myIncidents.length" class="empty">Aún no has enviado incidencias.</p></div>
      </section>
    </div>

    <section v-if="selectedIncident" class="role-card detail-card"><div class="section-title"><div><p class="eyebrow">DETALLE DE SOLICITUD</p><h2>#{{ selectedIncident.id }} · {{ selectedIncident.title }}</h2></div><button class="text-action" type="button" @click="selectedId = null">Cerrar</button></div><p class="description">{{ selectedIncident.description }}</p><div class="detail-grid"><div><span>Estado</span><strong>{{ selectedIncident.status }}</strong></div><div><span>Técnico asignado</span><strong>{{ technicianName(selectedIncident.technicianId) }}</strong></div></div><div class="timeline"><article v-for="(update, index) in selectedIncident.updates || []" :key="`${update.date}-${index}`"><span>{{ update.date }}</span><p>{{ update.text }}</p></article></div></section>
  </ApplicantFramework>
</template>
