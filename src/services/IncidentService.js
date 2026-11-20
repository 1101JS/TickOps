const INCIDENTS_KEY = 'eticket-incidents'

const INITIAL_INCIDENTS = [
  {
    id: 103,
    title: 'Sin conexión a internet',
    category: 'Redes',
    status: 'Pendiente',
    priority: 'Alta',
    description: 'El aula 203 no tiene conexión a la red institucional desde esta mañana.',
    createdAt: '14 nov 2026',
    reporter: 'Usuario final',
    technicianId: 1,
    updates: []
  },
  {
    id: 98,
    title: 'Error en el sistema',
    category: 'Software',
    status: 'Resuelta',
    priority: 'Alta',
    description: 'El sistema institucional mostraba un error al guardar los cambios.',
    createdAt: '12 nov 2026',
    reporter: 'Usuario final',
    technicianId: 2,
    updates: [{ date: '12 nov 2026', text: 'Incidencia resuelta y validada.' }]
  }
]

export const technicians = [
  { id: 1, name: 'Ana López', specialty: 'Hardware y redes' },
  { id: 2, name: 'Carlos Mejía', specialty: 'Software' },
  { id: 3, name: 'María García', specialty: 'Redes' },
  { id: 4, name: 'José Rivera', specialty: 'Soporte general' }
]

function clone(items) {
  return JSON.parse(JSON.stringify(items))
}

export function getIncidents() {
  try {
    const saved = JSON.parse(localStorage.getItem(INCIDENTS_KEY))
    return Array.isArray(saved) ? saved : clone(INITIAL_INCIDENTS)
  } catch {
    return clone(INITIAL_INCIDENTS)
  }
}

export function saveIncidents(incidents) {
  localStorage.setItem(INCIDENTS_KEY, JSON.stringify(incidents))
}

export function getLeastBusyTechnicianId(incidents = getIncidents()) {
  return technicians
    .map((technician) => ({
      id: technician.id,
      workload: incidents.filter((incident) => incident.technicianId === technician.id && incident.status !== 'Resuelta').length
    }))
    .sort((a, b) => a.workload - b.workload || a.id - b.id)[0].id
}

export function createIncident(data) {
  const incidents = getIncidents()
  const id = Math.max(0, ...incidents.map((incident) => incident.id)) + 1
  const technicianId = getLeastBusyTechnicianId(incidents)
  const incident = {
    id,
    title: data.title.trim(),
    category: data.category,
    priority: data.priority,
    description: data.description.trim(),
    reporter: data.reporter || 'Usuario final',
    createdAt: new Intl.DateTimeFormat('es-HN', { dateStyle: 'medium' }).format(new Date()),
    technicianId,
    status: 'Pendiente',
    updates: [{ date: 'Ahora', text: 'Incidencia registrada y asignada automáticamente.' }]
  }

  incidents.unshift(incident)
  saveIncidents(incidents)
  return incident
}
