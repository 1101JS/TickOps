import { api } from './api.js'

const dateFormat = new Intl.DateTimeFormat('es-HN', { dateStyle: 'medium' })
const dateTimeFormat = new Intl.DateTimeFormat('es-HN', { dateStyle: 'medium', timeStyle: 'short' })

function format(formatter, iso) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : formatter.format(date)
}

// Adapta la respuesta de la API al formato que ya usan las vistas (fechas legibles).
function normalize(ticket) {
  return {
    ...ticket,
    createdAtIso: ticket.createdAt,
    createdAt: format(dateFormat, ticket.createdAt),
    updates: (ticket.updates || []).map((update) => ({ ...update, date: format(dateTimeFormat, update.date) }))
  }
}

export async function getIncidents() {
  const data = await api('/tickets')
  return data.tickets.map(normalize)
}

export async function createIncident({ title, category, priority, description, technicianId }) {
  const data = await api('/tickets', { method: 'POST', body: { title, category, priority, description, technicianId } })
  return normalize(data.ticket)
}

export async function updateIncident(id, changes) {
  const data = await api(`/tickets/${id}`, { method: 'PATCH', body: changes })
  return normalize(data.ticket)
}

export async function addIncidentUpdate(id, text) {
  const data = await api(`/tickets/${id}/updates`, { method: 'POST', body: { text } })
  return normalize(data.ticket)
}

export async function getTechnicians() {
  const data = await api('/technicians')
  return data.technicians
}

// Reemplaza una incidencia dentro de una lista reactiva por su versión actualizada del servidor.
export function replaceIncident(list, ticket) {
  const index = list.findIndex((item) => item.id === ticket.id)
  if (index === -1) list.unshift(ticket)
  else list[index] = ticket
}
