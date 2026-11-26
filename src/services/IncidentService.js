import { ref } from 'vue'
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
// Sube cada vez que se recargan los catálogos a la fuerza (p. ej. tras crear un departamento),
// para que componentes como el selector "Ver como" vuelvan a leerlos.
export const catalogsVersion = ref(0)
export function getCatalogs(force = false) {
  if (!catalogs || force) {
    catalogs = api('/catalogos').catch((error) => { catalogs = null; throw error })
    if (force) catalogsVersion.value++
  }
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

// imagenes: lista opcional de File (png, jpg, gif, webp); con imágenes se envía como multipart.
export async function addComment(id, { contenido, esInterno = false, esResolucion = false, imagenes = [] }) {
  if (!imagenes.length) {
    return (await api(`/incidencias/${id}/comentarios`, { method: 'POST', body: { contenido, esInterno, esResolucion } })).incidencia
  }
  const form = new FormData()
  form.append('contenido', contenido)
  form.append('esInterno', String(esInterno))
  form.append('esResolucion', String(esResolucion))
  for (const file of imagenes) form.append('imagenes', file)
  return (await apiUpload(`/incidencias/${id}/comentarios`, form)).incidencia
}

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp']

export function checkImages(files) {
  if (files.length > 5) return 'Puedes agregar hasta 5 imágenes por comentario.'
  for (const file of files) {
    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
    if (!IMAGE_EXTENSIONS.includes(extension)) return `"${file.name}": solo se aceptan imágenes (${IMAGE_EXTENSIONS.join(', ')}).`
    if (file.size > 5 * 1024 * 1024) return `"${file.name}" supera el máximo de 5 MB.`
    if (!file.size) return `"${file.name}" está vacío.`
  }
  return ''
}

// Devuelve la incidencia actualizada, o null si el usuario ya no puede verla (pasó a otro departamento).
export async function transferIncident(id, { idCategoria, motivo }) {
  return (await api(`/incidencias/${id}/transferencias`, { method: 'POST', body: { idCategoria, motivo } })).incidencia
}

// ---------- Incidencias relacionadas ----------
// tipo: 'duplicada' (reporta lo mismo que la principal) | 'causa_raiz' (es un síntoma del problema de la principal).
export const RELATION_TYPES = {
  duplicada: { label: 'Duplicada', child: 'Duplicada de', verb: 'es un duplicado de' },
  causa_raiz: { label: 'Causa raíz', child: 'Causada por', verb: 'es causada por el problema de' }
}

// Relaciona "id" con la incidencia principal. Devuelve la incidencia "id" actualizada.
export async function relateIncident(id, { idPrincipal, tipo }) {
  return (await api(`/incidencias/${id}/relacion`, { method: 'PUT', body: { idPrincipal, tipo } })).incidencia
}

export async function unrelateIncident(id) {
  return (await api(`/incidencias/${id}/relacion`, { method: 'DELETE' })).incidencia
}

// Resuelve o cierra de una vez las relacionadas elegidas de una principal ya resuelta. Devuelve { incidencia, actualizadas }.
export async function resolveRelated(principalId, { ids, estado, comentario }) {
  return api(`/incidencias/${principalId}/relacionadas/resolver`, { method: 'POST', body: { ids, estado, comentario } })
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

// ---------- Departamentos (administración) ----------

export async function getDepartments() {
  return (await api('/departamentos')).departamentos
}

// department: { nombre, descripcion }
export async function createDepartment(department) {
  return (await api('/departamentos', { method: 'POST', body: department })).departamento
}

// changes: { nombre?, descripcion?, activo? }
export async function updateDepartment(id, changes) {
  return (await api(`/departamentos/${id}`, { method: 'PATCH', body: changes })).departamento
}

export async function deleteDepartment(id) {
  await api(`/departamentos/${id}`, { method: 'DELETE' })
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

// ---------- Estadísticas (solo administrador) ----------

// filtros: { desde, hasta (AAAA-MM-DD), agrupar: 'agente'|'departamento'|'categoria'|'prioridad', periodo: 'dia'|'semana'|'mes',
//            idDepartamento?, idAgente?, idCategoria?, idPrioridad? }
export async function getStatistics(filtros = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filtros)) if (value !== '' && value != null) params.set(key, value)
  return api(`/estadisticas?${params}`)
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

// ---------- Apartados por estado (recuadros seleccionables) ----------

export const STATES = ['Pendiente', 'En Proceso', 'Resuelto', 'Cerrado', 'Rechazado']
const isOpenIncident = (i) => !i.estadoFinal && i.estado !== 'Resuelto'

// key: 'abiertas' | 'sin-asignar' | 'vencidas' | 'todas' | nombre de un estado.
export function matchesStatus(incident, key) {
  if (key === 'todas') return true
  if (key === 'abiertas') return isOpenIncident(incident)
  if (key === 'sin-asignar') return isOpenIncident(incident) && !incident.agenteId
  if (key === 'vencidas') return Boolean(incident.sla?.resolucionVencida)
  return incident.estado === key
}

// Recuadros para <StatusFilterCards>: "Abiertas", uno por estado y, si se piden, "Sin asignar", "SLA vencido" y "Todas".
export function statusCards(list, { unassigned = false, late = false, all = true } = {}) {
  const count = (key) => list.filter((i) => matchesStatus(i, key)).length
  const cards = [{ key: 'abiertas', label: 'Abiertas', tone: 'open', count: count('abiertas') }]
  if (unassigned) cards.push({ key: 'sin-asignar', label: 'Sin asignar', tone: 'unassigned', count: count('sin-asignar') })
  for (const estado of STATES) cards.push({ key: estado, label: estado, tone: slug(estado), count: count(estado) })
  if (late) cards.push({ key: 'vencidas', label: 'SLA vencido', tone: 'late', count: count('vencidas') })
  if (all) cards.push({ key: 'todas', label: 'Todas', tone: 'all', count: list.length })
  return cards
}
