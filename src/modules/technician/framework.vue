<script setup>
import RoleFramework from '../shared/RoleFramework.vue'

const items = [
  { label: 'Mis asignaciones', target: 'assignments' },
  { label: 'Seguimiento', target: 'tracking' }
]
</script>

<template><RoleFramework role="TÉCNICO" subtitle="Mesa de soporte" :items="items"><slot /></RoleFramework></template>
