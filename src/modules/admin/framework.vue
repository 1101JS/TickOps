<script setup>
import RoleFramework from '../shared/RoleFramework.vue'

const items = [
  { label: 'Panel principal', to: { name: 'AdminDashboard', hash: '#panel' } },
  { label: 'Incidencias', to: { name: 'AdminDashboard', hash: '#incidents' } },
  { label: 'Registrar incidencia', to: { name: 'AdminDashboard', hash: '#new-incident' } },
  { label: 'Agentes', to: { name: 'AdminDashboard', hash: '#agents' } },
  { label: 'Departamentos', to: { name: 'AdminDashboard', hash: '#departments' } },
  { label: 'Categorías', to: { name: 'AdminDashboard', hash: '#categories' } },
  { label: 'Usuarios', to: { name: 'AdminDashboard', hash: '#users' } }
]
</script>

<template><RoleFramework role="ADMINISTRACIÓN" subtitle="Centro de control" :items="items"><slot /></RoleFramework></template>
