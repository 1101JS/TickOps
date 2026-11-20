<script setup>
import RoleFramework from '../shared/RoleFramework.vue'

const items = [
  { label: 'Nueva incidencia', target: 'new-incident' },
  { label: 'Mis solicitudes', target: 'my-incidents' }
]
</script>

<template><RoleFramework role="USUARIO" subtitle="Portal de solicitudes" :items="items"><slot /></RoleFramework></template>
