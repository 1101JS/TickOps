<script setup>
import RoleFramework from '../shared/RoleFramework.vue'

const items = [
  { label: 'Resumen', target: 'summary' },
  { label: 'Bandeja de trabajo', target: 'queue' }
]
</script>

<template><RoleFramework role="AGENTE" subtitle="Mesa de soporte" :items="items"><slot /></RoleFramework></template>
