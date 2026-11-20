<script setup>
import RoleFramework from '../shared/RoleFramework.vue'

const items = [
  { label: 'Panel principal', target: 'panel' },
  { label: 'Incidencias', target: 'incidencias' },
  { label: 'Técnicos', target: 'technicians' }
]
</script>

<template><RoleFramework role="ADMINISTRACIÓN" subtitle="Centro de control" :items="items"><slot /></RoleFramework></template>
