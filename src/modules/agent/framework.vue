<script setup>
import RoleFramework from '../shared/RoleFramework.vue'

const items = [
  { label: 'Resumen', to: { name: 'AgentDashboard', hash: '#summary' } },
  { label: 'Bandeja de trabajo', to: { name: 'AgentDashboard', hash: '#queue' } }
]
</script>

<template><RoleFramework role="AGENTE" subtitle="Mesa de soporte" :items="items"><slot /></RoleFramework></template>
