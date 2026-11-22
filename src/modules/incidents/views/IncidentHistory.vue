<script setup>
import { ref, computed } from 'vue';

const incidenciaSeleccionadaId = ref(101);
const filtroEvento = ref('Todos');

const incidenciasEjemplo = [
  {
    id: 101,
    codigo: 'INC-0101',
    titulo: 'Caída de enlace de red en área operativa',
    departamento: 'Redes e Infraestructura',
    prioridad: 'Crítica',
    estadoActual: 'Pendiente',
    solicitante: 'Marcela Holmes',
    agenteActual: 'Sin asignar',
  },
  {
    id: 102,
    codigo: 'INC-0102',
    titulo: 'Configuración de estación de trabajo y correo',
    departamento: 'Soporte Técnico',
    prioridad: 'Media',
    estadoActual: 'Resuelto',
    solicitante: 'Jerricka Scott',
    agenteActual: 'David Martinez',
  },
  {
    id: 103,
    codigo: 'INC-0103',
    titulo: 'Revisión de luminaria en oficina principal',
    departamento: 'Mantenimiento',
    prioridad: 'Baja',
    estadoActual: 'Cerrado',
    solicitante: 'Kendrick Gerard Melendez Scott',
    agenteActual: 'Miguel Angel',
  },
];

const historialesPorIncidencia = {
  101: [
    {
      id: 1,
      fecha: '20/11/2026 08:15',
      tipo: 'Creación',
      responsable: 'Marcela Holmes',
      rol: 'Solicitante',
      estadoAnterior: null,
      estadoNuevo: 'Pendiente',
      agenteAnterior: null,
      agenteNuevo: null,
      detalle: 'Incidencia registrada con prioridad Crítica (SLA 2h hábiles).',
    },
    {
      id: 2,
      fecha: '20/11/2026 08:28',
      tipo: 'Asignación',
      responsable: 'David Martinez',
      rol: 'Agente',
      estadoAnterior: 'Pendiente',
      estadoNuevo: 'En Proceso',
      agenteAnterior: 'Sin asignar',
      agenteNuevo: 'David Martinez',
      detalle: 'Tomada en Soporte Técnico para diagnóstico inicial.',
    },
    {
      id: 3,
      fecha: '20/11/2026 09:05',
      tipo: 'Transferencia',
      responsable: 'David Martinez',
      rol: 'Agente',
      estadoAnterior: 'En Proceso',
      estadoNuevo: 'Pendiente',
      agenteAnterior: 'David Martinez',
      agenteNuevo: 'Sin asignar',
      detalle:
        'Motivo de transferencia a Redes e Infraestructura: requiere intervención en switch troncal y VLAN.',
    },
  ],
  102: [
    {
      id: 11,
      fecha: '19/11/2026 14:05',
      tipo: 'Creación',
      responsable: 'Jerricka Scott',
      rol: 'Solicitante',
      estadoAnterior: null,
      estadoNuevo: 'Pendiente',
      agenteAnterior: null,
      agenteNuevo: null,
      detalle: 'Solicitud registrada en Soporte Técnico.',
    },
    {
      id: 12,
      fecha: '19/11/2026 15:10',
      tipo: 'Asignación',
      responsable: 'David Martinez',
      rol: 'Agente',
      estadoAnterior: 'Pendiente',
      estadoNuevo: 'En Proceso',
      agenteAnterior: 'Sin asignar',
      agenteNuevo: 'David Martinez',
      detalle: 'Inicio de configuración de perfil y herramientas.',
    },
    {
      id: 13,
      fecha: '20/11/2026 10:30',
      tipo: 'Resolución',
      responsable: 'David Martinez',
      rol: 'Agente',
      estadoAnterior: 'En Proceso',
      estadoNuevo: 'Resuelto',
      agenteAnterior: 'David Martinez',
      agenteNuevo: 'David Martinez',
      detalle:
        'Nota de resolución: equipo configurado y probado en sesión con la solicitante.',
    },
  ],
  103: [
    {
      id: 21,
      fecha: '12/11/2026 09:00',
      tipo: 'Creación',
      responsable: 'Kendrick Gerard Melendez Scott',
      rol: 'Administrador',
      estadoAnterior: null,
      estadoNuevo: 'Pendiente',
      agenteAnterior: null,
      agenteNuevo: null,
      detalle: 'Reporte de mantenimiento registrado.',
    },
    {
      id: 22,
      fecha: '12/11/2026 11:20',
      tipo: 'Resolución',
      responsable: 'Miguel Angel',
      rol: 'Agente',
      estadoAnterior: 'Pendiente',
      estadoNuevo: 'Resuelto',
      agenteAnterior: 'Sin asignar',
      agenteNuevo: 'Miguel Angel',
      detalle: 'Nota de resolución: balastro y lámpara reemplazados con éxito.',
    },
    {
      id: 23,
      fecha: '16/11/2026 09:05',
      tipo: 'Cierre',
      responsable: 'Sistema',
      rol: 'Auditoría',
      estadoAnterior: 'Resuelto',
      estadoNuevo: 'Cerrado',
      agenteAnterior: 'Miguel Angel',
      agenteNuevo: 'Miguel Angel',
      detalle: 'Ticket cerrado (solo lectura); sin cambios posteriores permitidos.',
    },
  ],
};

const incidenciaActual = computed(() => {
  return (
    incidenciasEjemplo.find((i) => i.id === incidenciaSeleccionadaId.value) ||
    incidenciasEjemplo[0]
  );
});

const eventos = computed(() => {
  const lista = historialesPorIncidencia[incidenciaSeleccionadaId.value] || [];
  if (filtroEvento.value === 'Todos') return lista;
  return lista.filter((ev) => ev.tipo === filtroEvento.value);
});
</script>

<template>
  <div class="history-view">
    <header class="history-header">
      <div>
        <h1 class="history-title">Historial y Traqueo de Incidencia</h1>
        <p class="history-subtitle">
          Trazabilidad de estados, asignaciones, transferencias y resoluciones
        </p>
      </div>

      <div class="history-controls">
        <select v-model="incidenciaSeleccionadaId" class="ctrl-select">
          <option v-for="inc in incidenciasEjemplo" :key="inc.id" :value="inc.id">
            {{ inc.codigo }} — {{ inc.titulo }}
          </option>
        </select>

        <select v-model="filtroEvento" class="ctrl-select">
          <option value="Todos">Todos los eventos</option>
          <option value="Creación">Creación</option>
          <option value="Asignación">Asignación</option>
          <option value="Transferencia">Transferencia</option>
          <option value="Resolución">Resolución</option>
          <option value="Cierre">Cierre</option>
        </select>
      </div>
    </header>

    <div v-if="incidenciaActual.estadoActual === 'Cerrado'" class="readonly-banner">
      Incidencia en estado <strong>Cerrado</strong>: vista en modo de solo lectura.
    </div>

    <section class="summary-card">
      <div class="summary-top">
        <div>
          <span class="ticket-code">{{ incidenciaActual.codigo }}</span>
          <h2 class="ticket-heading">{{ incidenciaActual.titulo }}</h2>
        </div>

        <div class="summary-badges">
          <span
            :class="[
              'chip',
              incidenciaActual.prioridad === 'Crítica' ? 'chip-critical' : 'chip-priority',
            ]"
          >
            Prioridad: {{ incidenciaActual.prioridad }}
            <template v-if="incidenciaActual.prioridad === 'Crítica'"> · SLA 2h</template>
          </span>
          <span class="chip chip-status">{{ incidenciaActual.estadoActual }}</span>
        </div>
      </div>

      <div class="summary-meta">
        <div>
          <span class="meta-label">Departamento</span>
          <span class="meta-value">{{ incidenciaActual.departamento }}</span>
        </div>
        <div>
          <span class="meta-label">Solicitante</span>
          <span class="meta-value">{{ incidenciaActual.solicitante }}</span>
        </div>
        <div>
          <span class="meta-label">Agente asignado</span>
          <span class="meta-value">{{ incidenciaActual.agenteActual }}</span>
        </div>
      </div>
    </section>

    <section class="timeline-card">
      <h3 class="timeline-heading">Línea de tiempo ({{ eventos.length }})</h3>

      <ol class="timeline-list">
        <li v-for="ev in eventos" :key="ev.id" class="timeline-item">
          <div :class="['timeline-marker', `marker-${ev.tipo.toLowerCase()}`]"></div>

          <div class="timeline-content">
            <div class="ev-header">
              <div class="ev-title-group">
                <span :class="['ev-tag', `tag-${ev.tipo.toLowerCase()}`]">
                  {{ ev.tipo }}
                </span>
                <span class="ev-actor">
                  por <strong>{{ ev.responsable }}</strong> ({{ ev.rol }})
                </span>
              </div>
              <time class="ev-date">{{ ev.fecha }}</time>
            </div>

            <p v-if="ev.detalle" class="ev-detail">{{ ev.detalle }}</p>

            <div class="ev-changes">
              <span class="change-pill">
                Estado:
                <template v-if="ev.estadoAnterior">
                  <s>{{ ev.estadoAnterior }}</s> →
                </template>
                <strong>{{ ev.estadoNuevo }}</strong>
              </span>

              <span v-if="ev.agenteAnterior || ev.agenteNuevo" class="change-pill">
                Agente:
                <template v-if="ev.agenteAnterior">
                  <s>{{ ev.agenteAnterior }}</s> →
                </template>
                <strong>{{ ev.agenteNuevo || 'Sin asignar' }}</strong>
              </span>
            </div>
          </div>
        </li>

        <li v-if="eventos.length === 0" class="timeline-empty">
          No hay eventos de este tipo para la incidencia seleccionada.
        </li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
.history-view {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 1.5rem;
  font-family: var(--font-primary);
  color: var(--color-text);
}

.history-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.history-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--color-text);
}

.history-subtitle {
  margin: 0.25rem 0 0;
  font-size: 0.9rem;
  color: var(--color-text-secondary);
}

.history-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.ctrl-select {
  padding: 0.52rem 0.75rem;
  border-radius: var(--radius-button);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.88rem;
  max-width: 340px;
}

.ctrl-select:focus {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.readonly-banner {
  padding: 0.75rem 1rem;
  border-radius: var(--radius-button);
  font-size: 0.88rem;
  background: var(--color-surface-secondary);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
}

.summary-card,
.timeline-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  padding: 1.25rem;
}

.summary-top {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.ticket-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8rem;
  color: var(--color-primary);
  font-weight: 700;
}

.ticket-heading {
  margin: 0.2rem 0 0;
  font-size: 1.15rem;
  color: var(--color-text);
}

.summary-badges {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.chip {
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
}

.chip-priority {
  background: var(--color-surface-secondary);
  color: var(--color-warning);
  border: 1px solid var(--color-warning);
}

.chip-critical {
  background: var(--color-surface-secondary);
  color: var(--color-danger);
  border: 1px solid var(--color-danger);
}

.chip-status {
  background: var(--color-primary-soft);
  color: var(--color-primary);
  border: 1px solid var(--color-primary);
}

.summary-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 0.9rem;
  padding-top: 0.9rem;
  border-top: 1px solid var(--color-border);
}

.meta-label {
  display: block;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.meta-value {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text);
}

.timeline-heading {
  margin: 0 0 1.1rem;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text);
}

.timeline-list {
  list-style: none;
  margin: 0;
  padding: 0 0 0 0.5rem;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.timeline-list::before {
  content: '';
  position: absolute;
  left: 0.88rem;
  top: 0.4rem;
  bottom: 0.4rem;
  width: 2px;
  background: var(--color-border);
}

.timeline-item {
  position: relative;
  padding-left: 2.1rem;
}

.timeline-marker {
  position: absolute;
  left: 0.5rem;
  top: 0.35rem;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--color-primary);
  border: 2px solid var(--color-surface);
}

.marker-creación {
  background: var(--color-primary);
}

.marker-asignación {
  background: var(--color-primary-hover);
}

.marker-transferencia {
  background: var(--color-warning);
}

.marker-resolución,
.marker-cierre {
  background: var(--color-success);
}

.timeline-content {
  background: var(--color-surface-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-button);
  padding: 0.85rem 1rem;
}

.ev-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.5rem;
  align-items: center;
}

.ev-title-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
}

.ev-tag {
  padding: 0.16rem 0.5rem;
  border-radius: 6px;
  font-size: 0.74rem;
  font-weight: 700;
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

.tag-creación {
  background: var(--color-primary-soft);
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.tag-asignación {
  background: var(--color-primary-soft);
  color: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
}

.tag-transferencia {
  background: var(--color-surface);
  color: var(--color-warning);
  border-color: var(--color-warning);
}

.tag-resolución,
.tag-cierre {
  background: var(--color-surface);
  color: var(--color-success);
  border-color: var(--color-success);
}

.ev-actor {
  font-size: 0.86rem;
  color: var(--color-text-secondary);
}

.ev-actor strong {
  color: var(--color-text);
}

.ev-date {
  font-size: 0.78rem;
  color: var(--color-text-secondary);
}

.ev-detail {
  margin: 0.55rem 0 0;
  font-size: 0.88rem;
  line-height: 1.45;
  color: var(--color-text);
}

.ev-changes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.65rem;
}

.change-pill {
  font-size: 0.78rem;
  padding: 0.22rem 0.55rem;
  border-radius: 6px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
}

.change-pill strong {
  color: var(--color-text);
}

.change-pill s {
  opacity: 0.65;
}

.timeline-empty {
  padding-left: 1.5rem;
  color: var(--color-text-secondary);
  font-size: 0.9rem;
}
</style>