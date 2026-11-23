<script setup>
// Ficha de una incidencia compartida por los tres roles (se muestra en la ruta /incidencia/:id).
// Qué botones aparecen lo decide el servidor en "incidencia.acciones"; aquí no se repiten las reglas.
// Diseño: un cuadro de resumen siempre a la vista (estado, datos clave y acciones) y el detalle en pestañas.
// Las opciones adicionales (comentar, adjuntar, transferir, relacionar...) se abren con botones en una ventana.
import { computed, onMounted, ref, watch } from 'vue'
import AppModal from '../../shared/AppModal.vue'
import {
  ATTACHMENT_EXTENSIONS, RELATION_TYPES, addComment, attachmentUrl, categoriesByDepartment, checkAttachments, deleteAttachment, formatBytes,
  formatDateTime, getAgents, getCatalogs, getIncident, getIncidents, relateIncident, resolveRelated, slug, transferIncident, unrelateIncident,
  updateIncident, uploadAttachments
} from '../../../services/IncidentService.js'

const props = defineProps({
  incidentId: { type: Number, required: true },
  user: { type: Object, required: true }
})
// "removed": el usuario ya no puede ver la incidencia (p. ej. la transfirió a otro departamento).
const emit = defineEmits(['removed'])

const inc = ref(null)
const catalogs = ref({ categorias: [], prioridades: [] })
const agents = ref([])
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const tab = ref('comentarios')
// Ventana abierta: null | 'transition' | 'edit' | 'transfer' | 'comment' | 'files' | 'relate' | 'bulk'
const modal = ref(null)

const transition = ref(null)
const transitionComment = ref('')
const transitionAgent = ref('')
const comment = ref({ contenido: '', tipo: 'publico' })
const transfer = ref({ idCategoria: '', motivo: '' })
const pendingFiles = ref([])
const acceptedTypes = ATTACHMENT_EXTENSIONS.join(',')

const isOwner = computed(() => inc.value?.solicitanteId === props.user.id)
const manages = computed(() => Boolean(inc.value?.acciones.gestionar))
const hasResolution = computed(() => inc.value?.comentarios.some((c) => c.esResolucion))
const sameDepartmentCategories = computed(() => catalogs.value.categorias.filter((c) => c.departamentoId === inc.value?.departamentoId))
const otherDepartmentGroups = computed(() => categoriesByDepartment(catalogs.value.categorias.filter((c) => c.departamentoId !== inc.value?.departamentoId)))
const related = computed(() => inc.value?.relacionadas || [])
const openRelated = computed(() => related.value.filter((r) => !r.estadoFinal && r.estado !== 'Resuelto'))
const showRelatedTab = computed(() => Boolean(inc.value && (inc.value.principal || related.value.length || inc.value.acciones.relacionar)))
const tabs = computed(() => [
  { key: 'comentarios', label: 'Comentarios', count: inc.value?.comentarios.length },
  { key: 'adjuntos', label: 'Adjuntos', count: inc.value?.adjuntos.length },
  ...(showRelatedTab.value ? [{ key: 'relacionadas', label: 'Relacionadas', count: related.value.length + (inc.value?.principal ? 1 : 0) }] : []),
  { key: 'historial', label: 'Historial', count: inc.value?.historial.length }
])

// Para poner En Proceso una incidencia sin agente, el administrador debe elegir quién la atiende.
const needsAgent = computed(() => transition.value === 'En Proceso' && !inc.value?.agenteId && manages.value && props.user.role === 'admin')
const reopening = computed(() => transition.value === 'En Proceso' && inc.value?.estado === 'Resuelto')
const commentRequired = computed(() =>
  transition.value === 'Rechazado' || (transition.value === 'Resuelto' && !hasResolution.value) || (reopening.value && !manages.value)
)
const commentLabel = computed(() => ({
  Resuelto: 'Comentario de resolución (lo verá el solicitante)',
  Rechazado: 'Motivo del rechazo',
  Cerrado: 'Comentario (opcional)',
  Pendiente: 'Comentario (opcional)'
}[transition.value] || (reopening.value ? '¿Por qué se reabre?' : 'Comentario (opcional)')))

function transitionLabel(target) {
  if (target === 'En Proceso') return inc.value.estado === 'Resuelto' ? 'Reabrir' : 'Iniciar atención'
  if (target === 'Pendiente') return 'Devolver a la cola'
  if (target === 'Resuelto') return 'Marcar como resuelta'
  if (target === 'Cerrado') return isOwner.value && !manages.value ? 'Confirmar solución y cerrar' : 'Cerrar'
  if (target === 'Rechazado') return 'Rechazar'
  return target
}

function historyText(entry) {
  if (entry.detalle) return entry.detalle
  return entry.estadoAnterior ? `${entry.estadoAnterior} → ${entry.estadoNuevo}` : entry.estadoNuevo
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [detail, catalog] = await Promise.all([getIncident(props.incidentId), getCatalogs()])
    inc.value = detail
    catalogs.value = catalog
    await loadAgents()
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function loadAgents() {
  if (props.user.role === 'admin' && inc.value?.acciones.gestionar) agents.value = await getAgents(inc.value.departamentoId)
}

function openModal(name) {
  error.value = ''
  notice.value = ''
  modal.value = name
}

function closeModal() {
  modal.value = null
  error.value = ''
}

// Ejecuta una acción contra la API y refresca la ficha con lo que devuelve el servidor.
// Si sale bien se cierra la ventana y el aviso se muestra arriba; si falla, el error queda en la ventana abierta.
async function run(action, message) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const result = await action()
    if (result === null) {
      emit('removed', props.incidentId)
      return
    }
    inc.value = result
    notice.value = typeof message === 'function' ? message(result) : message
    modal.value = null
    return true
  } catch (err) {
    error.value = err.message
  } finally {
    busy.value = false
  }
}

function change(changes, message = 'Cambios guardados.') {
  return run(() => updateIncident(inc.value.id, changes), message)
}

function startTransition(target) {
  transition.value = target
  transitionComment.value = ''
  transitionAgent.value = ''
  openModal('transition')
}

async function applyTransition() {
  const target = transition.value
  const changes = { estado: target }
  const text = transitionComment.value.trim()
  if (text) changes.comentario = text
  if (needsAgent.value) changes.idAgente = Number(transitionAgent.value)
  const ok = await change(changes, (result) => {
    const pending = (result.relacionadas || []).filter((r) => !r.estadoFinal && r.estado !== 'Resuelto').length
    return target === 'Resuelto' && pending
      ? `Incidencia resuelta. Tiene ${pending} relacionada(s) abierta(s): verifícalas en "Relacionadas" y ciérralas de una vez.`
      : `Estado actualizado a ${target}.`
  })
  if (ok && target === 'Resuelto' && inc.value.acciones.resolverRelacionadas) tab.value = 'relacionadas'
}

function startComment() {
  comment.value = { contenido: '', tipo: 'publico' }
  openModal('comment')
}

async function sendComment() {
  const { contenido, tipo } = comment.value
  const ok = await run(
    () => addComment(inc.value.id, { contenido: contenido.trim(), esInterno: tipo === 'interno', esResolucion: tipo === 'resolucion' }),
    'Comentario agregado.'
  )
  if (ok) tab.value = 'comentarios'
}

function startTransfer() {
  transfer.value = { idCategoria: '', motivo: '' }
  openModal('transfer')
}

async function sendTransfer() {
  const ok = await run(
    () => transferIncident(inc.value.id, { idCategoria: Number(transfer.value.idCategoria), motivo: transfer.value.motivo.trim() }),
    'Incidencia transferida.'
  )
  if (ok) await loadAgents()
}

function startFiles() {
  pendingFiles.value = []
  openModal('files')
}

function pickFiles(event) {
  pendingFiles.value = [...event.target.files]
  error.value = checkAttachments(pendingFiles.value)
}

async function sendFiles() {
  const problem = checkAttachments(pendingFiles.value)
  if (problem) {
    error.value = problem
    return
  }
  const count = pendingFiles.value.length
  const ok = await run(() => uploadAttachments(inc.value.id, pendingFiles.value), `${count} archivo(s) adjuntado(s).`)
  if (ok) tab.value = 'adjuntos'
}

function canDeleteFile(file) {
  return inc.value.acciones.adjuntar && (props.user.role === 'admin' || file.autorId === props.user.id)
}

async function removeFile(file) {
  if (!window.confirm(`¿Eliminar el archivo "${file.nombre}"?`)) return
  await run(() => deleteAttachment(inc.value.id, file.id), 'Archivo eliminado.')
}

// ---------- Incidencias relacionadas ----------
// Dos formas de relacionar: "esta es parte de otra" (se elige la principal) o "agregar otras a esta" (se eligen varias).
const relate = ref({ modo: 'principal', tipo: 'duplicada', idPrincipal: null, ids: [], buscar: '' })
const candidates = ref([])
const loadingCandidates = ref(false)
// Una incidencia relacionada no puede tener relacionadas propias (un solo nivel), y viceversa.
const canBeChild = computed(() => Boolean(inc.value?.acciones.relacionar && !related.value.length))
const canBePrincipal = computed(() => Boolean(inc.value && !inc.value.principal))
const candidateList = computed(() => {
  const term = relate.value.buscar.trim().toLowerCase()
  const list = candidates.value.filter((c) => {
    if (c.id === inc.value.id) return false
    // Principal: que no sea a su vez relacionada de otra. Para agregar: que se pueda gestionar y no tenga relacionadas.
    if (relate.value.modo === 'principal') return !c.principalId
    return c.acciones.relacionar && !c.totalRelacionadas && c.principalId !== inc.value.id
  })
  return list.filter((c) => !term || [c.id, c.titulo, c.solicitante, c.departamento].join(' ').toLowerCase().includes(term)).slice(0, 60)
})

async function startRelate() {
  relate.value = { modo: canBeChild.value ? 'principal' : 'agregar', tipo: 'duplicada', idPrincipal: null, ids: [], buscar: '' }
  openModal('relate')
  loadingCandidates.value = true
  try {
    candidates.value = await getIncidents()
  } catch (err) {
    error.value = err.message
  } finally {
    loadingCandidates.value = false
  }
}

async function sendRelate() {
  const { modo, tipo, idPrincipal, ids } = relate.value
  if (modo === 'principal') {
    const ok = await run(() => relateIncident(inc.value.id, { idPrincipal, tipo }), `Relacionada con la incidencia #${idPrincipal}.`)
    if (ok) tab.value = 'relacionadas'
    return
  }
  // Se relacionan una por una; si alguna falla, las anteriores ya quedaron y se informa cuál falló.
  const ok = await run(async () => {
    const done = []
    for (const id of ids) {
      try {
        await relateIncident(id, { idPrincipal: inc.value.id, tipo })
        done.push(id)
      } catch (err) {
        if (done.length) inc.value = await getIncident(inc.value.id)
        throw new Error(`#${id}: ${err.message}${done.length ? ` (sí se relacionaron: ${done.map((d) => `#${d}`).join(', ')})` : ''}`)
      }
    }
    return getIncident(inc.value.id)
  }, `${ids.length} incidencia(s) relacionada(s) con esta.`)
  if (ok) tab.value = 'relacionadas'
}

async function removeRelation(childId) {
  const own = childId === inc.value.id
  if (!window.confirm(own ? `¿Quitar la relación con la incidencia #${inc.value.principal.id}?` : `¿Quitar la incidencia #${childId} de las relacionadas?`)) return
  await run(async () => {
    const updated = await unrelateIncident(childId)
    return own ? updated : getIncident(inc.value.id)
  }, 'Relación eliminada.')
}

// Cerrar (o resolver) de una vez las relacionadas, después de verificar que la solución de la principal también las resolvió.
const bulk = ref({ ids: [], estado: 'Cerrado', comentario: '' })
const bulkCandidates = computed(() => related.value.filter((r) => r.gestionable && !r.estadoFinal))
const bulkCount = ref(0)

function startBulk() {
  const resolution = [...inc.value.comentarios].reverse().find((c) => c.esResolucion)?.contenido
  bulk.value = {
    ids: bulkCandidates.value.map((r) => r.id),
    estado: 'Cerrado',
    // El servidor agrega a cada una "(Resuelta junto con la incidencia principal #X.)".
    comentario: resolution || 'Se solucionó el problema de origen.'
  }
  openModal('bulk')
}

function sendBulk() {
  const { ids, estado, comentario } = bulk.value
  return run(async () => {
    const result = await resolveRelated(inc.value.id, { ids, estado, comentario: comentario.trim() })
    bulkCount.value = result.actualizadas
    return result.incidencia
  }, () => `${bulkCount.value} incidencia(s) relacionada(s) ${bulk.value.estado === 'Cerrado' ? 'cerrada(s)' : 'resuelta(s)'}.`)
}

watch(() => props.incidentId, load)
onMounted(load)
</script>

<template>
  <article class="idt-page" :aria-label="`Incidencia #${incidentId}`">
    <header class="idt-header">
      <span class="idt-kicker">INCIDENCIA #{{ incidentId }}</span>
      <h1>{{ inc?.titulo || (loading ? 'Cargando…' : 'Incidencia no disponible') }}</h1>
      <div v-if="inc" class="idt-tags">
        <span class="idt-pill" :class="`st-${slug(inc.estado)}`">{{ inc.estado }}</span>
        <span class="idt-pill" :class="`pr-${slug(inc.prioridad)}`">Prioridad {{ inc.prioridad }}</span>
        <span v-if="inc.sla.resolucionVencida" class="idt-pill late">SLA de resolución vencido</span>
        <span v-else-if="inc.sla.respuestaVencida" class="idt-pill late">Sin primera respuesta a tiempo</span>
        <span v-if="inc.principal" class="idt-pill rel">↳ {{ RELATION_TYPES[inc.principal.tipo]?.child }} #{{ inc.principal.id }}</span>
        <span v-if="related.length" class="idt-pill rel">⛓ {{ related.length }} relacionada(s)</span>
      </div>
    </header>

    <p v-if="error && !modal" class="idt-alert error" role="alert">{{ error }}</p>
    <p v-if="notice" class="idt-alert ok" role="status">{{ notice }}</p>
    <p v-if="loading" class="idt-muted">Cargando…</p>

    <div v-if="inc && !loading" class="idt-layout">
      <!-- Cuadro de resumen: lo esencial y las acciones, siempre a la vista. -->
      <aside class="idt-summary" aria-label="Resumen de la incidencia">
        <dl class="idt-facts">
          <div><dt>Departamento</dt><dd>{{ inc.departamento }} · {{ inc.categoria }}</dd></div>
          <div><dt>Solicitante</dt><dd>{{ inc.solicitante }}</dd></div>
          <div><dt>Agente</dt><dd>{{ inc.agente || 'Sin asignar' }}</dd></div>
          <div><dt>Registrada</dt><dd>{{ formatDateTime(inc.fechaCreacion) }}</dd></div>
          <div><dt>Resolver antes de</dt><dd :class="{ 'idt-late': inc.sla.resolucionVencida }">{{ formatDateTime(inc.sla.venceResolucion) }}</dd></div>
          <div v-if="inc.fechaCierre || inc.fechaResolucion"><dt>{{ inc.fechaCierre ? 'Cerrada' : 'Resuelta' }}</dt><dd>{{ formatDateTime(inc.fechaCierre || inc.fechaResolucion) }}</dd></div>
        </dl>

        <button v-if="inc.principal" type="button" class="idt-relation" @click="tab = 'relacionadas'">
          <span>{{ RELATION_TYPES[inc.principal.tipo]?.child }}</span>
          <strong>#{{ inc.principal.id }}{{ inc.principal.titulo ? ` · ${inc.principal.titulo}` : ' · problema general' }}</strong>
          <span class="idt-pill" :class="`st-${slug(inc.principal.estado)}`">{{ inc.principal.estado }}</span>
        </button>
        <button v-else-if="related.length" type="button" class="idt-relation" @click="tab = 'relacionadas'">
          <span>Incidencias relacionadas</span>
          <strong>{{ related.length }} · {{ openRelated.length }} sin resolver</strong>
        </button>
        <div v-if="inc.acciones.resolverRelacionadas" class="idt-callout">
          <p>El problema principal ya está {{ inc.estado.toLowerCase() }}. Verifica las relacionadas y ciérralas de una vez.</p>
          <button class="idt-btn primary" type="button" :disabled="busy" @click="startBulk">Verificar y cerrar relacionadas</button>
        </div>

        <div v-if="inc.acciones.estados.length || (manages && user.role !== 'admin')" class="idt-actions">
          <button
            v-for="target in inc.acciones.estados" :key="target" type="button" class="idt-btn"
            :class="{ danger: target === 'Rechazado', primary: target === 'Resuelto' || (target === 'Cerrado' && isOwner && !manages) }"
            :disabled="busy" @click="startTransition(target)"
          >{{ transitionLabel(target) }}</button>
          <template v-if="manages && user.role !== 'admin'">
            <button v-if="!inc.agenteId" class="idt-btn primary" type="button" :disabled="busy" @click="change({ idAgente: user.id }, 'Ahora atiendes esta incidencia.')">Tomar esta incidencia</button>
            <button v-else-if="inc.agenteId === user.id" class="idt-btn" type="button" :disabled="busy" @click="change({ idAgente: null }, 'Soltaste la incidencia; volvió a la cola.')">Soltar (devolver a la cola)</button>
          </template>
        </div>
        <p v-if="inc.reabrirHasta && isOwner" class="idt-muted">Si el problema continúa, puedes reabrirla hasta el {{ formatDateTime(inc.reabrirHasta) }}.</p>

        <div class="idt-more" aria-label="Más opciones">
          <button v-if="inc.acciones.comentar" class="idt-chip" type="button" @click="startComment">💬 Comentar</button>
          <button v-if="inc.acciones.adjuntar" class="idt-chip" type="button" @click="startFiles">📎 Adjuntar</button>
          <button v-if="manages" class="idt-chip" type="button" @click="openModal('edit')">✎ Editar datos</button>
          <button v-if="inc.acciones.transferir" class="idt-chip" type="button" @click="startTransfer">⇄ Transferir</button>
          <button v-if="inc.acciones.relacionar && (canBeChild || canBePrincipal)" class="idt-chip" type="button" @click="startRelate">⛓ Relacionar</button>
        </div>
      </aside>

      <div class="idt-main">
        <section class="idt-description">
          <h3>Descripción</h3>
          <p class="idt-text">{{ inc.descripcion }}</p>
        </section>

        <div class="idt-tabs" role="tablist" aria-label="Detalle de la incidencia">
          <button v-for="t in tabs" :key="t.key" type="button" role="tab" :aria-selected="tab === t.key" :class="{ active: tab === t.key }" @click="tab = t.key">
            {{ t.label }} <span>{{ t.count }}</span>
          </button>
        </div>

        <section v-if="tab === 'comentarios'" class="idt-panel" role="tabpanel">
          <p v-if="!inc.comentarios.length" class="idt-muted">Aún no hay comentarios.</p>
          <article v-for="c in inc.comentarios" :key="c.id" class="idt-comment" :class="{ internal: c.esInterno, resolution: c.esResolucion }">
            <header>
              <strong>{{ c.autor }}</strong><span>{{ c.autorRol }} · {{ formatDateTime(c.fecha) }}</span>
              <em v-if="c.esInterno">Nota interna</em><em v-if="c.esResolucion">Resolución</em>
            </header>
            <p class="idt-text">{{ c.contenido }}</p>
          </article>
          <button v-if="inc.acciones.comentar" class="idt-btn" type="button" @click="startComment">+ Agregar comentario</button>
        </section>

        <section v-else-if="tab === 'adjuntos'" class="idt-panel" role="tabpanel">
          <p v-if="!inc.adjuntos.length" class="idt-muted">No hay archivos adjuntos.</p>
          <ul v-else class="idt-files">
            <li v-for="file in inc.adjuntos" :key="file.id">
              <a v-if="file.esImagen" class="idt-thumb" :href="attachmentUrl(inc.id, file.id)" target="_blank" rel="noopener">
                <img :src="attachmentUrl(inc.id, file.id)" :alt="file.nombre" loading="lazy" />
              </a>
              <span v-else class="idt-file-icon" aria-hidden="true">{{ file.nombre.split('.').pop().toUpperCase() }}</span>
              <div class="idt-file-info">
                <a :href="attachmentUrl(inc.id, file.id)" target="_blank" rel="noopener">{{ file.nombre }}</a>
                <small>{{ formatBytes(file.tamano) }} · {{ file.autor }} · {{ formatDateTime(file.fecha) }}</small>
              </div>
              <a class="idt-btn" :href="attachmentUrl(inc.id, file.id, true)">Descargar</a>
              <button v-if="canDeleteFile(file)" class="idt-btn danger" type="button" :disabled="busy" @click="removeFile(file)">Eliminar</button>
            </li>
          </ul>
          <button v-if="inc.acciones.adjuntar" class="idt-btn" type="button" @click="startFiles">+ Adjuntar archivos</button>
        </section>

        <section v-else-if="tab === 'relacionadas'" class="idt-panel" role="tabpanel">
          <template v-if="inc.principal">
            <p class="idt-muted">Esta incidencia {{ RELATION_TYPES[inc.principal.tipo]?.verb }}:</p>
            <div class="idt-rel-row">
              <div class="idt-rel-main">
                <RouterLink v-if="inc.principal.visible" :to="{ name: 'IncidentDetail', params: { id: inc.principal.id } }">#{{ inc.principal.id }} · {{ inc.principal.titulo }}</RouterLink>
                <strong v-else>#{{ inc.principal.id }} · Problema general que atiende el equipo de soporte</strong>
                <small>Cuando se solucione, esta incidencia se resolverá junto con ella.</small>
              </div>
              <span class="idt-pill" :class="`st-${slug(inc.principal.estado)}`">{{ inc.principal.estado }}</span>
              <button v-if="inc.acciones.relacionar" class="idt-btn" type="button" :disabled="busy" @click="removeRelation(inc.id)">Quitar relación</button>
            </div>
          </template>
          <template v-else-if="related.length">
            <p class="idt-muted">{{ related.length }} incidencia(s) dependen de esta. Al solucionar esta, verifica que también quedaron resueltas y ciérralas de una vez.</p>
            <div v-for="r in related" :key="r.id" class="idt-rel-row">
              <div class="idt-rel-main">
                <RouterLink v-if="r.visible" :to="{ name: 'IncidentDetail', params: { id: r.id } }">#{{ r.id }} · {{ r.titulo }}</RouterLink>
                <strong v-else>#{{ r.id }} · (de otro departamento)</strong>
                <small>{{ RELATION_TYPES[r.tipo]?.label }} · {{ r.departamento }} · {{ r.agente || 'Sin asignar' }}</small>
              </div>
              <span class="idt-pill" :class="`st-${slug(r.estado)}`">{{ r.estado }}</span>
              <button v-if="r.gestionable && !r.estadoFinal" class="idt-btn" type="button" :disabled="busy" @click="removeRelation(r.id)">Quitar</button>
            </div>
            <button v-if="inc.acciones.resolverRelacionadas" class="idt-btn primary" type="button" :disabled="busy" @click="startBulk">Verificar y cerrar relacionadas</button>
            <p v-else-if="openRelated.length && !['Resuelto', 'Cerrado'].includes(inc.estado)" class="idt-muted">Podrás cerrarlas todas de una vez cuando esta incidencia esté resuelta.</p>
          </template>
          <p v-else class="idt-muted">No está relacionada con otras incidencias. Usa «Relacionar» para agrupar duplicados o vincularla a un problema raíz.</p>
          <button v-if="inc.acciones.relacionar && (canBeChild || canBePrincipal)" class="idt-btn" type="button" @click="startRelate">⛓ Relacionar</button>
        </section>

        <section v-else class="idt-panel" role="tabpanel">
          <template v-if="inc.transferencias.length">
            <h4>Transferencias</h4>
            <ol class="idt-timeline">
              <li v-for="t in inc.transferencias" :key="t.id">
                <span>{{ formatDateTime(t.fecha) }} · {{ t.usuario }}</span>
                <p>{{ t.origen }} → {{ t.destino }}: {{ t.motivo }}</p>
              </li>
            </ol>
            <h4>Historial</h4>
          </template>
          <ol class="idt-timeline">
            <li v-for="h in [...inc.historial].reverse()" :key="h.id">
              <span>{{ formatDateTime(h.fecha) }}{{ h.responsable ? ` · ${h.responsable}` : '' }}</span>
              <p>{{ historyText(h) }}</p>
            </li>
          </ol>
        </section>
      </div>
    </div>

    <!-- ---------- Ventanas de las opciones ---------- -->
    <AppModal v-if="modal === 'transition'" :title="transitionLabel(transition)" :kicker="`INCIDENCIA #${inc.id}`" @close="closeModal">
      <form class="idt-form" @submit.prevent="applyTransition">
        <label v-if="needsAgent">Agente que la atenderá
          <select v-model="transitionAgent" required>
            <option value="" disabled>Selecciona un agente…</option>
            <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.nombre }} · {{ a.carga }} abierta(s)</option>
          </select>
          <small v-if="!agents.length" class="idt-muted">No hay agentes activos en {{ inc.departamento }}; crea uno en Usuarios para poder atenderla.</small>
        </label>
        <label>{{ commentLabel }}<textarea v-model="transitionComment" :required="commentRequired" maxlength="5000" /></label>
        <p v-if="error" class="idt-alert error" role="alert">{{ error }}</p>
        <div class="idt-buttons end">
          <button class="idt-btn" type="button" @click="closeModal">Cancelar</button>
          <button class="idt-btn primary" type="submit" :disabled="busy || (needsAgent && !agents.length)">{{ busy ? 'Guardando…' : 'Confirmar' }}</button>
        </div>
      </form>
    </AppModal>

    <AppModal v-if="modal === 'comment'" title="Agregar comentario" :kicker="`INCIDENCIA #${inc.id}`" @close="closeModal">
      <form class="idt-form" @submit.prevent="sendComment">
        <label>Comentario<textarea v-model="comment.contenido" required maxlength="5000" placeholder="Escribe un comentario…" /></label>
        <div v-if="inc.acciones.comentarioInterno" class="idt-radios" role="radiogroup" aria-label="Tipo de comentario">
          <label><input v-model="comment.tipo" type="radio" value="publico" /> Público</label>
          <label><input v-model="comment.tipo" type="radio" value="interno" /> Nota interna (no la ve el solicitante)</label>
          <label><input v-model="comment.tipo" type="radio" value="resolucion" /> De resolución</label>
        </div>
        <p v-if="error" class="idt-alert error" role="alert">{{ error }}</p>
        <div class="idt-buttons end">
          <button class="idt-btn" type="button" @click="closeModal">Cancelar</button>
          <button class="idt-btn primary" type="submit" :disabled="busy">{{ busy ? 'Enviando…' : 'Agregar comentario' }}</button>
        </div>
      </form>
    </AppModal>

    <AppModal v-if="modal === 'files'" title="Adjuntar archivos" :kicker="`INCIDENCIA #${inc.id}`" @close="closeModal">
      <form class="idt-form" @submit.prevent="sendFiles">
        <label>Archivos <span class="idt-hint">capturas, PDF o documentos · hasta 5 por vez, 5 MB cada uno</span>
          <input type="file" multiple :accept="acceptedTypes" required @change="pickFiles" />
        </label>
        <p v-if="pendingFiles.length" class="idt-muted">{{ pendingFiles.map((f) => f.name).join(', ') }}</p>
        <p v-if="error" class="idt-alert error" role="alert">{{ error }}</p>
        <div class="idt-buttons end">
          <button class="idt-btn" type="button" @click="closeModal">Cancelar</button>
          <button class="idt-btn primary" type="submit" :disabled="busy || !pendingFiles.length">{{ busy ? 'Subiendo…' : `Subir ${pendingFiles.length || ''} archivo(s)` }}</button>
        </div>
      </form>
    </AppModal>

    <AppModal v-if="modal === 'edit'" title="Editar datos" :kicker="`INCIDENCIA #${inc.id}`" @close="closeModal">
      <div class="idt-form">
        <p class="idt-muted">Cada cambio se guarda al elegirlo y queda en el historial.</p>
        <label>Prioridad
          <select :value="inc.prioridadId" :disabled="busy" @change="change({ idPrioridad: Number($event.target.value) }, 'Prioridad actualizada.')">
            <option v-for="p in catalogs.prioridades" :key="p.id" :value="p.id">{{ p.nombre }} · resolver en {{ p.slaResolucionHoras }} h</option>
          </select>
        </label>
        <label>Categoría
          <select :value="inc.categoriaId" :disabled="busy" @change="change({ idCategoria: Number($event.target.value) }, 'Categoría actualizada.')">
            <option v-for="c in sameDepartmentCategories" :key="c.id" :value="c.id">{{ c.nombre }}</option>
          </select>
        </label>
        <label v-if="user.role === 'admin'">Agente asignado
          <select :value="inc.agenteId ?? ''" :disabled="busy" @change="change({ idAgente: $event.target.value ? Number($event.target.value) : null }, 'Asignación actualizada.')">
            <option value="">Sin asignar</option>
            <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.nombre }} · {{ a.carga }} abierta(s)</option>
          </select>
          <small v-if="!agents.length" class="idt-muted">No hay agentes activos en {{ inc.departamento }}.</small>
        </label>
        <p v-if="error" class="idt-alert error" role="alert">{{ error }}</p>
        <div class="idt-buttons end"><button class="idt-btn" type="button" @click="closeModal">Listo</button></div>
      </div>
    </AppModal>

    <AppModal v-if="modal === 'transfer'" title="Transferir a otro departamento" :kicker="`INCIDENCIA #${inc.id}`" @close="closeModal">
      <form class="idt-form" @submit.prevent="sendTransfer">
        <label>Categoría de destino
          <select v-model="transfer.idCategoria" required>
            <option value="" disabled>Selecciona…</option>
            <optgroup v-for="g in otherDepartmentGroups" :key="g.departamento" :label="g.departamento">
              <option v-for="c in g.items" :key="c.id" :value="c.id">{{ c.nombre }}</option>
            </optgroup>
          </select>
        </label>
        <label>Motivo<textarea v-model="transfer.motivo" required maxlength="2000" placeholder="Por qué corresponde a otro departamento" /></label>
        <p class="idt-muted">Al transferirla vuelve a Pendiente y queda sin agente en el departamento de destino.</p>
        <p v-if="error" class="idt-alert error" role="alert">{{ error }}</p>
        <div class="idt-buttons end">
          <button class="idt-btn" type="button" @click="closeModal">Cancelar</button>
          <button class="idt-btn primary" type="submit" :disabled="busy">Transferir</button>
        </div>
      </form>
    </AppModal>

    <AppModal v-if="modal === 'relate'" title="Relacionar incidencias" :kicker="`INCIDENCIA #${inc.id}`" wide @close="closeModal">
      <form class="idt-form" @submit.prevent="sendRelate">
        <div class="idt-segment" role="radiogroup" aria-label="Cómo relacionar">
          <label :class="{ active: relate.modo === 'principal', disabled: !canBeChild }">
            <input v-model="relate.modo" type="radio" value="principal" :disabled="!canBeChild" />
            <strong>Esta es parte de otra</strong><small>Elige la incidencia principal (el problema raíz o el reporte original).</small>
          </label>
          <label :class="{ active: relate.modo === 'agregar', disabled: !canBePrincipal }">
            <input v-model="relate.modo" type="radio" value="agregar" :disabled="!canBePrincipal" />
            <strong>Agregar otras a esta</strong><small>Esta será la principal; elige las que dependen de ella.</small>
          </label>
        </div>
        <div class="idt-radios" role="radiogroup" aria-label="Tipo de relación">
          <label><input v-model="relate.tipo" type="radio" value="duplicada" /> Duplicada (reportan lo mismo)</label>
          <label><input v-model="relate.tipo" type="radio" value="causa_raiz" /> Causa raíz (es un síntoma del problema principal)</label>
        </div>
        <input v-model="relate.buscar" class="idt-search" type="search" placeholder="Buscar por número, título, solicitante o departamento…" aria-label="Buscar incidencias" />
        <p v-if="loadingCandidates" class="idt-muted">Cargando incidencias…</p>
        <ul v-else class="idt-pick">
          <li v-for="c in candidateList" :key="c.id">
            <label>
              <input v-if="relate.modo === 'principal'" v-model="relate.idPrincipal" type="radio" :value="c.id" name="principal" />
              <input v-else v-model="relate.ids" type="checkbox" :value="c.id" />
              <span class="idt-pick-main"><strong>#{{ c.id }} · {{ c.titulo }}</strong><small>{{ c.departamento }} · {{ c.solicitante }}{{ c.totalRelacionadas ? ` · ⛓ ${c.totalRelacionadas}` : '' }}</small></span>
              <span class="idt-pill" :class="`st-${slug(c.estado)}`">{{ c.estado }}</span>
            </label>
          </li>
          <li v-if="!candidateList.length" class="idt-muted">No hay incidencias que se puedan relacionar{{ relate.buscar ? ' con esa búsqueda' : '' }}.</li>
        </ul>
        <p v-if="error" class="idt-alert error" role="alert">{{ error }}</p>
        <div class="idt-buttons end">
          <button class="idt-btn" type="button" @click="closeModal">Cancelar</button>
          <button class="idt-btn primary" type="submit" :disabled="busy || (relate.modo === 'principal' ? !relate.idPrincipal : !relate.ids.length)">
            {{ busy ? 'Guardando…' : relate.modo === 'principal' ? 'Relacionar' : `Relacionar ${relate.ids.length || ''} incidencia(s)` }}
          </button>
        </div>
      </form>
    </AppModal>

    <AppModal v-if="modal === 'bulk'" title="Verificar y cerrar relacionadas" :kicker="`PRINCIPAL #${inc.id}`" wide @close="closeModal">
      <form class="idt-form" @submit.prevent="sendBulk">
        <p class="idt-muted">Marca las que comprobaste que quedaron solucionadas con la incidencia principal. Las que no marques siguen abiertas.</p>
        <ul class="idt-pick">
          <li v-for="r in bulkCandidates" :key="r.id">
            <label>
              <input v-model="bulk.ids" type="checkbox" :value="r.id" />
              <span class="idt-pick-main"><strong>#{{ r.id }} · {{ r.titulo || '(de otro departamento)' }}</strong><small>{{ RELATION_TYPES[r.tipo]?.label }} · {{ r.agente || 'Sin asignar' }}</small></span>
              <span class="idt-pill" :class="`st-${slug(r.estado)}`">{{ r.estado }}</span>
            </label>
          </li>
        </ul>
        <div class="idt-radios" role="radiogroup" aria-label="Estado final">
          <label><input v-model="bulk.estado" type="radio" value="Cerrado" /> Cerrarlas</label>
          <label><input v-model="bulk.estado" type="radio" value="Resuelto" /> Marcarlas resueltas (cada solicitante confirma o reabre)</label>
        </div>
        <label>Comentario de resolución (lo verá cada solicitante)<textarea v-model="bulk.comentario" required maxlength="5000" /></label>
        <p v-if="error" class="idt-alert error" role="alert">{{ error }}</p>
        <div class="idt-buttons end">
          <button class="idt-btn" type="button" @click="closeModal">Cancelar</button>
          <button class="idt-btn primary" type="submit" :disabled="busy || !bulk.ids.length">
            {{ busy ? 'Guardando…' : `${bulk.estado === 'Cerrado' ? 'Cerrar' : 'Resolver'} ${bulk.ids.length} incidencia(s)` }}
          </button>
        </div>
      </form>
    </AppModal>
  </article>
</template>

<style scoped>
.idt-page{--idt-card:var(--role-card,#fff);--idt-bg:var(--role-field,#f8fafc);--idt-text:var(--role-text,#172033);--idt-muted:var(--role-muted,#64748b);--idt-border:var(--role-border,#e3e9f2);--idt-primary:var(--role-primary,#2563eb)}
.idt-page,.idt-page *{box-sizing:border-box}
.idt-page{width:100%;max-width:1180px;color:var(--idt-text);font-family:Arial,sans-serif}
.idt-header{margin-bottom:16px}
.idt-header h1{margin:6px 0 0;color:var(--idt-text);font-size:25px;font-weight:700;line-height:1.25;overflow-wrap:anywhere}
.idt-kicker{color:var(--idt-primary);font-size:10px;font-weight:800;letter-spacing:1.2px}
.idt-tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.idt-alert{margin:0 0 14px;padding:10px 12px;border-radius:8px;font-size:13px;line-height:1.5}
.idt-alert.error{background:#fee2e2;color:#991b1b}.idt-alert.ok{background:#dcfce7;color:#166534}
.idt-form .idt-alert{margin:0}
.idt-muted{margin:0 0 10px;color:var(--idt-muted);font-size:12px;line-height:1.5}
.idt-pill{display:inline-block;padding:5px 9px;border-radius:999px;background:var(--idt-bg);color:var(--idt-muted);font-size:11px;font-weight:800;white-space:nowrap}
.st-pendiente{background:#fef3c7;color:#a16207}.st-en-proceso{background:#dbeafe;color:#1d4ed8}.st-resuelto{background:#dcfce7;color:#15803d}.st-cerrado{background:#e2e8f0;color:#334155}.st-rechazado{background:#fee2e2;color:#b91c1c}
.pr-baja{background:#dbeafe;color:#1d4ed8}.pr-media{background:#fef3c7;color:#b45309}.pr-alta{background:#ffedd5;color:#c2410c}.pr-critica{background:#fee2e2;color:#b91c1c}
.idt-pill.late{background:#b91c1c;color:#fff}.idt-pill.rel{background:#ede9fe;color:#6d28d9}

/* Resumen a la izquierda en pantallas anchas (fijo al hacer scroll); arriba en teléfonos. */
.idt-layout{display:grid;grid-template-columns:300px minmax(0,1fr);gap:20px;align-items:start}
.idt-summary{position:sticky;top:16px;display:flex;flex-direction:column;gap:14px;max-height:calc(100vh - 32px);overflow-y:auto;padding:18px;border:1px solid var(--idt-border);border-radius:14px;background:var(--idt-card);box-shadow:var(--role-shadow,none)}
.idt-facts{display:grid;gap:10px;margin:0}
.idt-facts div{display:flex;justify-content:space-between;gap:10px;font-size:12px}
.idt-facts dt{color:var(--idt-muted)}.idt-facts dd{margin:0;font-weight:700;text-align:right;overflow-wrap:anywhere}
.idt-late{color:#dc2626}
.idt-relation{display:flex;flex-direction:column;align-items:flex-start;gap:5px;width:100%;padding:10px 12px;border:1px solid #c4b5fd;border-radius:10px;background:rgba(139,92,246,.07);color:var(--idt-text);cursor:pointer;font:inherit;text-align:left}
.idt-relation>span:first-child{color:#7c3aed;font-size:10px;font-weight:800;letter-spacing:.8px;text-transform:uppercase}
.idt-relation strong{font-size:12px;overflow-wrap:anywhere}
.idt-callout{padding:12px;border:1px solid #86efac;border-radius:10px;background:rgba(34,197,94,.08)}
.idt-callout p{margin:0 0 10px;font-size:12px;line-height:1.5}
.idt-callout .idt-btn{width:100%}
.idt-actions{display:flex;flex-direction:column;gap:8px;padding-top:14px;border-top:1px solid var(--idt-border)}
.idt-actions .idt-btn{width:100%}
.idt-more{display:flex;flex-wrap:wrap;gap:6px;padding-top:14px;border-top:1px solid var(--idt-border)}
.idt-chip{padding:7px 10px;border:1px solid var(--idt-border);border-radius:999px;background:var(--idt-bg);color:var(--idt-text);cursor:pointer;font-size:12px;font-weight:700}
.idt-chip:hover{border-color:var(--idt-primary);color:var(--idt-primary)}

.idt-main{min-width:0;padding:20px 22px;border:1px solid var(--idt-border);border-radius:14px;background:var(--idt-card);box-shadow:var(--role-shadow,none)}
.idt-description h3{margin:0 0 8px;font-size:13px}
.idt-text{margin:0;color:var(--idt-text);font-size:13px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}
.idt-tabs{display:flex;gap:4px;margin:18px 0 0;border-bottom:1px solid var(--idt-border);overflow-x:auto;scrollbar-width:none}
.idt-tabs button{flex:0 0 auto;padding:10px 12px;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--idt-muted);cursor:pointer;font-size:13px;font-weight:700}
.idt-tabs button span{margin-left:3px;padding:1px 6px;border-radius:999px;background:var(--idt-bg);font-size:10px}
.idt-tabs button.active{border-bottom-color:var(--idt-primary);color:var(--idt-primary)}
.idt-panel{display:flex;flex-direction:column;align-items:stretch;gap:10px;padding-top:16px}
.idt-panel>.idt-btn{align-self:flex-start}
.idt-panel h4{margin:6px 0 0;font-size:12px;color:var(--idt-muted)}

.idt-buttons{display:flex;flex-wrap:wrap;gap:8px}.idt-buttons.end{justify-content:flex-end}
.idt-btn{padding:9px 13px;border:1px solid var(--idt-border);border-radius:8px;background:var(--idt-bg);color:var(--idt-text);cursor:pointer;font-size:13px;font-weight:700}
.idt-btn:hover:not(:disabled){border-color:var(--idt-primary);color:var(--idt-primary)}
.idt-btn.primary{border-color:var(--idt-primary);background:var(--idt-primary);color:#fff}
.idt-btn.primary:hover:not(:disabled){color:#fff;filter:brightness(.95)}
.idt-btn.danger{color:#b91c1c}.idt-btn:disabled{opacity:.6;cursor:wait}
a.idt-btn{text-decoration:none}

.idt-form{display:flex;flex-direction:column;gap:12px}
.idt-form>label{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:700}
.idt-form textarea,.idt-form select,.idt-search{width:100%;padding:10px 11px;border:1px solid var(--role-field-border,var(--idt-border));border-radius:8px;background:var(--idt-bg);color:var(--idt-text);font:inherit;font-size:13px}
.idt-form textarea{min-height:96px;resize:vertical}
.idt-form input[type=file]{font:inherit;font-size:12px;color:var(--idt-text)}
.idt-hint{color:var(--idt-muted);font-size:11px;font-weight:400}
.idt-radios{display:flex;flex-wrap:wrap;gap:6px 16px}.idt-radios label{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:400}
.idt-segment{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.idt-segment label{display:flex;flex-direction:column;gap:3px;padding:10px 12px;border:1px solid var(--idt-border);border-radius:10px;cursor:pointer;font-size:12px}
.idt-segment label.active{border-color:var(--idt-primary);box-shadow:0 0 0 1px var(--idt-primary) inset;background:var(--role-primary-soft,rgba(37,99,235,.06))}
.idt-segment label.disabled{opacity:.5;cursor:not-allowed}
.idt-segment input{position:absolute;opacity:0;pointer-events:none}
.idt-segment small{color:var(--idt-muted);font-size:11px;line-height:1.4}
.idt-pick{display:flex;flex-direction:column;gap:6px;max-height:300px;margin:0;padding:0;overflow-y:auto;list-style:none}
.idt-pick label{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--idt-border);border-radius:9px;cursor:pointer}
.idt-pick label:hover{border-color:var(--idt-primary)}
.idt-pick-main{flex:1;min-width:0}
.idt-pick-main strong,.idt-pick-main small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.idt-pick-main strong{font-size:12px}.idt-pick-main small{margin-top:2px;color:var(--idt-muted);font-size:11px}

.idt-rel-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--idt-border);border-radius:10px;background:var(--idt-bg)}
.idt-rel-main{flex:1;min-width:0}
.idt-rel-main a,.idt-rel-main strong{display:block;color:var(--idt-text);font-size:13px;font-weight:700;overflow-wrap:anywhere}
.idt-rel-main a:hover{color:var(--idt-primary)}
.idt-rel-main small{display:block;margin-top:3px;color:var(--idt-muted);font-size:11px}

.idt-comment{padding:11px 13px;border:1px solid var(--idt-border);border-radius:10px}
.idt-comment.internal{border-style:dashed;background:rgba(234,179,8,.08)}.idt-comment.resolution{border-color:#86efac;background:rgba(34,197,94,.08)}
.idt-comment header{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px;margin-bottom:6px;font-size:12px}
.idt-comment header span{color:var(--idt-muted);font-size:11px}.idt-comment em{font-style:normal;font-size:10px;font-weight:800;color:var(--idt-primary)}
.idt-timeline{display:flex;flex-direction:column;gap:8px;margin:0;padding:0;list-style:none}
.idt-timeline li{padding:9px 12px;border-left:3px solid #93c5fd;background:var(--idt-bg)}
.idt-timeline span{color:var(--idt-muted);font-size:11px;font-weight:700}.idt-timeline p{margin:4px 0 0;font-size:13px;line-height:1.5;overflow-wrap:anywhere}
.idt-files{display:flex;flex-direction:column;gap:8px;margin:0;padding:0;list-style:none}
.idt-files li{display:flex;align-items:center;gap:12px;padding:8px 10px;border:1px solid var(--idt-border);border-radius:10px;background:var(--idt-bg)}
.idt-thumb{flex:0 0 56px;height:56px;overflow:hidden;border-radius:7px;border:1px solid var(--idt-border);background:var(--idt-card)}
.idt-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.idt-file-icon{display:grid;place-items:center;flex:0 0 56px;height:56px;border-radius:7px;background:var(--idt-card);border:1px solid var(--idt-border);color:var(--idt-primary);font-size:11px;font-weight:800}
.idt-file-info{flex:1;min-width:0}
.idt-file-info a{display:block;color:var(--idt-text);font-size:13px;font-weight:700;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.idt-file-info a:hover{color:var(--idt-primary);text-decoration:underline}
.idt-file-info small{color:var(--idt-muted);font-size:11px}
@media(max-width:900px){.idt-layout{grid-template-columns:1fr}.idt-summary{position:static;max-height:none}}
@media(max-width:560px){.idt-main{padding:16px}.idt-files li,.idt-rel-row{flex-wrap:wrap}.idt-segment{grid-template-columns:1fr}.idt-header h1{font-size:21px}}
</style>
