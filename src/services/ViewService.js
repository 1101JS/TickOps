// Cambio de vista del administrador: con su misma cuenta puede usar TickOps como agente de un departamento
// o como solicitante, y actuar ahí (tomar, resolver, registrar...). El servidor aplica las reglas de ese rol
// al recibir el encabezado X-Vista (ver server/middleware.js, applyView) y lo registra todo a nombre del admin.
import { ref } from 'vue'
import { setViewHeader } from './api.js'

const STORAGE_KEY = 'tickops-vista'

function read() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null')
    if (saved?.role === 'applicant' || (saved?.role === 'agent' && Number.isInteger(saved.departamentoId))) return saved
  } catch {
    // sessionStorage bloqueado o con datos inválidos: se empieza en la vista de administrador.
  }
  return null
}

// null = vista de administrador; { role: 'agent', departamentoId, departamento } o { role: 'applicant' }.
export const currentView = ref(read())
setViewHeader(headerFor(currentView.value))

function headerFor(view) {
  if (view?.role === 'agent') return `agente:${view.departamentoId}`
  if (view?.role === 'applicant') return 'solicitante'
  return null
}

export function setView(view) {
  currentView.value = view
  setViewHeader(headerFor(view))
  try {
    if (view) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(view))
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Sin sessionStorage la vista dura hasta recargar la página.
  }
}

export function clearView() {
  setView(null)
}

// Usuario con el que se dibujan las pantallas: el admin "como agente" lleva el rol y departamento de la vista.
export function actingUser(session) {
  const view = currentView.value
  if (session?.role !== 'admin' || !view) return session
  if (view.role === 'agent') return { ...session, role: 'agent', departamentoId: view.departamentoId, departamento: view.departamento, vista: 'agent' }
  return { ...session, role: 'applicant', vista: 'applicant' }
}
