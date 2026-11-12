
<script setup>
import '../styles/ApplicantDashboard.css'

const incidents = [
  {
    id: 104,
    title: 'Impresora falla',
    category: 'Hardware',
    status: 'En proceso'
  },
  {
    id: 98,
    title: 'Error Sistema',
    category: 'Software',
    status: 'Resuelta'
  }
]
</script>

<template>
  <main class="dashboard">
    <aside class="dashboard-sidebar">
      <div class="sidebar-brand">
        <h2>ETicket</h2>
        <span>UTH Soporte Técnico</span>
      </div>

      <nav class="sidebar-nav">
        <a href="#" class="nav-item active">⌂ Panel Principal</a>
        <a href="#" class="nav-item">＋ Nueva Incidencia</a>
        <a href="#" class="nav-item">▤ Mis Solicitudes</a>
      </nav>

      <button class="logout-button">Cerrar Sesión</button>
    </aside>

    <section class="dashboard-content">
      <header class="dashboard-header">
        <div>
          <h1>Panel Principal</h1>
          <p>Gestiona tus solicitudes de soporte técnico.</p>
        </div>
      </header>

      <div class="dashboard-grid">
        <section class="incident-form card">
          <h2>Registrar Nueva Incidencia</h2>

          <form @submit.prevent="console.log('Incidencia enviada')">
            <label for="title">Título</label>
            <input id="title" type="text" placeholder="Breve descripción..." required />

            <label for="category">Categoría</label>
            <select id="category" required>
              <option value="">Seleccione...</option>
              <option>Hardware</option>
              <option>Software</option>
              <option>Redes</option>
            </select>

            <label for="priority">Prioridad</label>
            <select id="priority">
              <option>Baja</option>
              <option selected>Media</option>
              <option>Alta</option>
            </select>

            <label for="description">Descripción</label>
            <textarea id="description" placeholder="Detalle su problema aquí..." required></textarea>

            <button type="submit" class="primary-button">
              Enviar Reporte
            </button>
          </form>
        </section>

        <section class="incident-history card">
          <h2>Historial Reciente</h2>

          <article
            v-for="incident in incidents"
            :key="incident.id"
            class="incident-item"
          >
            <div>
              <h3>#{{ incident.id }} - {{ incident.title }}</h3>
              <p>Cat: {{ incident.category }}</p>
            </div>

            <span
              class="incident-status"
              :class="incident.status === 'Resuelta' ? 'resolved' : 'progress'"
            >
              {{ incident.status }}
            </span>

            <button class="details-button">Ver Detalles</button>
          </article>
        </section>
      </div>
    </section>
  </main>
</template>
