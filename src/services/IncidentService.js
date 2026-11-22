import { api, apiUpload } from './api.js'

// ---------- Formato ----------

const dateFormat = new Intl.DateTimeFormat('es-HN', { dateStyle: 'medium' })
const dateTimeFormat = new Intl.DateTimeFormat('es-HN', { dateStyle: 'medium', timeStyle: 'short' })

export function formatDate(iso) {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? String(iso) : dateFormat.format(date)
}

export function formatDateTime(iso) {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? String(iso) : dateTimeFormat.format(date)
}

// "En Proceso" -> "en-proceso", "Crítica" -> "critica" (para las clases CSS de las etiquetas).
export function slug(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, '-')
}

export function initials(name) {
  return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('')
}

// ---------- Catálogos ----------

let catalogs = null
export function getCatalogs(force = false) {
  if (!catalogs || force) catalogs = api('/catalogos').catch((error) => { catalogs = null; throw error })
  return catalogs
}

// Categorías agrupadas por departamento, para <optgroup>.
export function categoriesByDepartment(categorias) {
  const groups = new Map()
  for (const categoria of categorias) {
    if (!groups.has(categoria.departamento)) groups.set(categoria.departamento, [])
    groups.get(categoria.departamento).push(categoria)
  }
  return [...groups].map(([departamento, items]) => ({ departamento, items }))
}

// ---------- Incidencias ----------

export async function getIncidents() {
  return (await api('/incidencias')).incidencias
}

export async function getIncident(id) {
  return (await api(`/incidencias/${id}`)).incidencia
}

export async function createIncident({ titulo, descripcion, idCategoria, idPrioridad }) {
  return (await api('/incidencias', { method: 'POST', body: { titulo, descripcion, idCategoria, idPrioridad } })).incidencia
}

// changes: { idPrioridad?, idCategoria?, idAgente?, estado?, comentario? }
export async function updateIncident(id, changes) {
  return (await api(`/incidencias/${id}`, { method: 'PATCH', body: changes })).incidencia
}

export async function addComment(id, { contenido, esInterno = false, esResolucion = false }) {
  return (await api(`/incidencias/${id}/comentarios`, { method: 'POST', body: { contenido, esInterno, esResolucion } })).incidencia
}

// Devuelve la incidencia actualizada, o null si el usuario ya no puede verla (pasó a otro departamento).
export async function transferIncident(id, { idCategoria, motivo }) {
  return (await api(`/incidencias/${id}/transferencias`, { method: 'POST', body: { idCategoria, motivo } })).incidencia
}

// Reemplaza (o agrega) una incidencia dentro de una lista reactiva. Si "incident" es null, la quita.
export function replaceIncident(list, incident, id = incident?.id) {
  const index = list.findIndex((item) => item.id === id)
  if (!incident) {
    if (index !== -1) list.splice(index, 1)
  } else if (index === -1) list.unshift(incident)
  else list[index] = incident
}

// ---------- Agentes y usuarios ----------

export async function getAgents(departamentoId) {
  return (await api(`/agentes${departamentoId ? `?departamento=${departamentoId}` : ''}`)).agentes
}

export async function getUsers() {
  return (await api('/usuarios')).usuarios
}

export async function createUser(user) {
  return (await api('/usuarios', { method: 'POST', body: user })).usuario
}

export async function updateUser(id, changes) {
  return (await api(`/usuarios/${id}`, { method: 'PATCH', body: changes })).usuario
}

// ---------- Categorías (administración) ----------

export async function getCategories() {
  return (await api('/categorias')).categorias
}

// category: { nombre, descripcion, idDepartamento }
export async function createCategory(category) {
  return (await api('/categorias', { method: 'POST', body: category })).categoria
}

// changes: { nombre?, descripcion?, idDepartamento?, activa? }
export async function updateCategory(id, changes) {
  return (await api(`/categorias/${id}`, { method: 'PATCH', body: changes })).categoria
}

export async function deleteCategory(id) {
  await api(`/categorias/${id}`, { method: 'DELETE' })
}

// ---------- Adjuntos ----------

export const ATTACHMENT_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.txt', '.log', '.csv', '.docx', '.xlsx', '.pptx', '.zip']
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024
export const ATTACHMENT_MAX_FILES = 5

// Revisa en el navegador lo mismo que el servidor (tipo, tamaño y cantidad) para avisar antes de subir.
export function checkAttachments(files) {
  if (files.length > ATTACHMENT_MAX_FILES) return `Puedes subir hasta ${ATTACHMENT_MAX_FILES} archivos a la vez.`
  for (const file of files) {
    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
    if (!ATTACHMENT_EXTENSIONS.includes(extension)) return `"${file.name}": tipo no permitido (${ATTACHMENT_EXTENSIONS.join(', ')}).`
    if (file.size > ATTACHMENT_MAX_BYTES) return `"${file.name}" supera el máximo de 5 MB.`
    if (!file.size) return `"${file.name}" está vacío.`
  }
  return ''
}

export async function uploadAttachments(incidentId, files) {
  const form = new FormData()
  for (const file of files) form.append('archivos', file)
  return (await apiUpload(`/incidencias/${incidentId}/adjuntos`, form)).incidencia
}

export async function deleteAttachment(incidentId, attachmentId) {
  return (await api(`/incidencias/${incidentId}/adjuntos/${attachmentId}`, { method: 'DELETE' })).incidencia
}

export function attachmentUrl(incidentId, attachmentId, download = false) {
  return `/api/incidencias/${incidentId}/adjuntos/${attachmentId}${download ? '?descargar' : ''}`
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
