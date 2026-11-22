<script setup>
import RoleFramework from '../shared/RoleFramework.vue'

const items = [
  { label: 'Nueva incidencia', to: { name: 'ApplicantDashboard', params: { vista: 'nueva' } } },
  { label: 'Mis solicitudes', to: { name: 'ApplicantDashboard' } }
]
</script>

<template><RoleFramework role="USUARIO" subtitle="Portal de solicitudes" :items="items"><slot /></RoleFramework></template>
