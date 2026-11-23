<script setup>
import RoleFramework from '../shared/RoleFramework.vue'

const items = [
  { label: 'Bandeja de trabajo', to: { name: 'AgentDashboard' } },
  { label: 'Nueva incidencia', to: { name: 'AgentDashboard', params: { vista: 'nueva' } } }
]
</script>

<template><RoleFramework role="AGENTE" subtitle="Mesa de soporte" :items="items"><slot /></RoleFramework></template>
