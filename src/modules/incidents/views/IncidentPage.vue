<script setup>
// Ruta /incidencia/:id: muestra la ficha completa dentro del portal de cada rol.
import { computed, ref, watch } from 'vue'
import AdminFramework from '../../admin/framework.vue'
import AgentFramework from '../../agent/framework.vue'
import ApplicantFramework from '../../applicant/framework.vue'
import IncidentDetail from '../components/IncidentDetail.vue'
import '../styles/RoleViews.css'
import { getSession, routeForRole } from '../../../services/AuthService.js'
import { actingUser, currentView } from '../../../services/ViewService.js'

const props = defineProps({
  incidentId: { type: Number, required: true }
})

// En la vista de agente o solicitante del administrador, la ficha se muestra y gestiona como ese rol.
const user = actingUser(getSession())
const removed = ref(false)

const framework = computed(() => ({ admin: AdminFramework, agent: AgentFramework }[user?.role] || ApplicantFramework))
const back = computed(() => ({
  name: routeForRole(user?.role),
  query: currentView.value?.role === 'agent' ? { departamento: String(currentView.value.departamentoId) } : {},
  hash: user?.role === 'admin' ? '#incidents' : ''
}))
const backLabel = computed(() => ({ admin: 'Volver a incidencias', agent: 'Volver a la bandeja' }[user?.role] || 'Volver a mis solicitudes'))

watch(() => props.incidentId, () => { removed.value = false })
</script>

<template>
  <component :is="framework">
    <nav class="incident-page-nav" aria-label="Ruta de navegación">
      <RouterLink class="text-action" :to="back">← {{ backLabel }}</RouterLink>
    </nav>

    <section v-if="removed" class="role-card narrow-card">
      <p class="eyebrow">INCIDENCIA #{{ incidentId }}</p>
      <h2>La incidencia se transfirió a otro departamento</h2>
      <p class="description">Ya no forma parte de tu bandeja, por eso no puedes seguir viéndola.</p>
      <RouterLink class="primary" :to="back">{{ backLabel }}</RouterLink>
    </section>

    <IncidentDetail v-else :key="incidentId" :incident-id="incidentId" :user="user" @removed="removed = true" />
  </component>
</template>

<style scoped>
.incident-page-nav{margin-bottom:16px}
.incident-page-nav .text-action{padding:0}
.role-card h2{margin:6px 0 8px;color:var(--role-text)}
.role-card .primary{display:inline-block;margin-top:8px}
</style>
