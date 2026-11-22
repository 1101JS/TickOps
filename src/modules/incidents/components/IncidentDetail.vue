<script setup>
// Ficha de una incidencia compartida por los tres roles (se muestra en la ruta /incidencia/:id).
// Qué botones aparecen lo decide el servidor en "incidencia.acciones"; aquí no se repiten las reglas.
import { computed, onMounted, ref, watch } from 'vue'
import {
  addComment, categoriesByDepartment, formatDateTime, getAgents, getCatalogs, getIncident, slug, transferIncident, updateIncident
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
// Dónde mostrar el último aviso/error: junto a la sección que lo provocó, para que se vea sin desplazarse.
const feedbackAt = ref('top')

const transition = ref(null)
const transitionComment = ref('')
const transitionAgent = ref('')
const comment = ref({ contenido: '', tipo: 'publico' })
const transfer = ref({ idCategoria: '', motivo: '' })

const isOwner = computed(() => inc.value?.solicitanteId === props.user.id)
const manages = computed(() => Boolean(inc.value?.acciones.gestionar))
const hasResolution = computed(() => inc.value?.comentarios.some((c) => c.esResolucion))
const sameDepartmentCategories = computed(() => catalogs.value.categorias.filter((c) => c.departamentoId === inc.value?.departamentoId))
const otherDepartmentGroups = computed(() => categoriesByDepartment(catalogs.value.categorias.filter((c) => c.departamentoId !== inc.value?.departamentoId)))

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

// Ejecuta una acción contra la API y refresca la ficha con lo que devuelve el servidor.
async function run(action, message, where = 'top') {
  if (busy.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  feedbackAt.value = where
  try {
    const result = await action()
    if (result === null) {
      emit('removed', props.incidentId)
      return
    }
    inc.value = result
    notice.value = message
    return true
  } catch (err) {
    error.value = err.message
  } finally {
    busy.value = false
  }
}

function change(changes, message = 'Cambios guardados.', where = 'manage') {
  return run(() => updateIncident(inc.value.id, changes), message, where)
}

function startTransition(target) {
  transition.value = target
  transitionComment.value = ''
  transitionAgent.value = ''
  if (feedbackAt.value === 'actions') error.value = ''
}

async function applyTransition() {
  const changes = { estado: transition.value }
  const text = transitionComment.value.trim()
  if (text) changes.comentario = text
  if (needsAgent.value) changes.idAgente = Number(transitionAgent.value)
  const ok = await change(changes, `Estado actualizado a ${transition.value}.`, 'actions')
  if (ok) transition.value = null
}

async function sendComment() {
  const { contenido, tipo } = comment.value
  const ok = await run(
    () => addComment(inc.value.id, { contenido: contenido.trim(), esInterno: tipo === 'interno', esResolucion: tipo === 'resolucion' }),
    'Comentario agregado.',
    'comments'
  )
  if (ok) comment.value = { contenido: '', tipo: 'publico' }
}

async function sendTransfer() {
  const ok = await run(
    () => transferIncident(inc.value.id, { idCategoria: Number(transfer.value.idCategoria), motivo: transfer.value.motivo.trim() }),
    'Incidencia transferida.',
    'transfer'
  )
  if (ok) {
    transfer.value = { idCategoria: '', motivo: '' }
    await loadAgents()
  }
}

watch(() => props.incidentId, load)
onMounted(load)
</script>

<template>
  <article class="idt-page" :aria-label="`Incidencia #${incidentId}`">
      <header class="idt-header">
        <div>
          <span class="idt-kicker">INCIDENCIA #{{ incidentId }}</span>
          <h1>{{ inc?.titulo || (loading ? 'Cargando…' : 'Incidencia no disponible') }}</h1>
        </div>
      </header>

      <template v-if="feedbackAt === 'top'">
        <p v-if="error" class="idt-alert error" role="alert">{{ error }}</p>
        <p v-if="notice && !error" class="idt-alert ok" role="status">{{ notice }}</p>
      </template>
      <p v-if="loading" class="idt-muted">Cargando…</p>

      <template v-if="inc && !loading">
        <div class="idt-tags">
          <span class="idt-pill" :class="`st-${slug(inc.estado)}`">{{ inc.estado }}</span>
          <span class="idt-pill" :class="`pr-${slug(inc.prioridad)}`">Prioridad {{ inc.prioridad }}</span>
          <span v-if="inc.sla.resolucionVencida" class="idt-pill late">SLA de resolución vencido</span>
          <span v-else-if="inc.sla.respuestaVencida" class="idt-pill late">Sin primera respuesta a tiempo</span>
        </div>

        <dl class="idt-grid">
          <div><dt>Departamento</dt><dd>{{ inc.departamento }}</dd></div>
          <div><dt>Categoría</dt><dd>{{ inc.categoria }}</dd></div>
          <div><dt>Solicitante</dt><dd>{{ inc.solicitante }}</dd></div>
          <div><dt>Agente</dt><dd>{{ inc.agente || 'Sin asignar' }}</dd></div>
          <div><dt>Registrada</dt><dd>{{ formatDateTime(inc.fechaCreacion) }}</dd></div>
          <div><dt>Última actualización</dt><dd>{{ formatDateTime(inc.fechaActualizacion) }}</dd></div>
          <div><dt>Resolver antes de</dt><dd>{{ formatDateTime(inc.sla.venceResolucion) }} <small>({{ inc.sla.resolucionHoras }} h)</small></dd></div>
          <div><dt>{{ inc.fechaCierre ? 'Cerrada' : inc.fechaResolucion ? 'Resuelta' : 'Primera respuesta' }}</dt><dd>{{ formatDateTime(inc.fechaCierre || inc.fechaResolucion || inc.fechaPrimeraRespuesta) }}</dd></div>
        </dl>

        <section class="idt-block">
          <h3>Descripción</h3>
          <p class="idt-text">{{ inc.descripcion }}</p>
        </section>

        <section v-if="inc.acciones.estados.length" class="idt-block">
          <h3>Acciones</h3>
          <div class="idt-buttons">
            <button
              v-for="target in inc.acciones.estados" :key="target" type="button" class="idt-btn"
              :class="{ danger: target === 'Rechazado', active: transition === target }" :disabled="busy" @click="startTransition(target)"
            >{{ transitionLabel(target) }}</button>
          </div>
          <p v-if="inc.reabrirHasta && isOwner" class="idt-muted">Si el problema continúa, puedes reabrirla hasta el {{ formatDateTime(inc.reabrirHasta) }}.</p>
          <form v-if="transition" class="idt-form" @submit.prevent="applyTransition">
            <label v-if="needsAgent">Agente que la atenderá
              <select v-model="transitionAgent" required>
                <option value="" disabled>Selecciona un agente…</option>
                <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.nombre }} · {{ a.carga }} abierta(s)</option>
              </select>
              <small v-if="!agents.length" class="idt-muted">No hay agentes activos en {{ inc.departamento }}; crea uno en Usuarios para poder atenderla.</small>
            </label>
            <label>{{ commentLabel }}<textarea v-model="transitionComment" :required="commentRequired" maxlength="5000" /></label>
            <div class="idt-buttons">
              <button class="idt-btn primary" type="submit" :disabled="busy || (needsAgent && !agents.length)">{{ busy ? 'Guardando…' : `Confirmar: ${transitionLabel(transition)}` }}</button>
              <button class="idt-btn" type="button" @click="transition = null">Cancelar</button>
            </div>
          </form>
          <template v-if="feedbackAt === 'actions'">
            <p v-if="error" class="idt-alert error" role="alert">{{ error }}</p>
            <p v-if="notice && !error" class="idt-alert ok" role="status">{{ notice }}</p>
          </template>
        </section>

        <section v-if="inc.acciones.gestionar" class="idt-block">
          <h3>Gestión</h3>
          <template v-if="feedbackAt === 'manage'">
            <p v-if="error" class="idt-alert error" role="alert">{{ error }}</p>
            <p v-if="notice && !error" class="idt-alert ok" role="status">{{ notice }}</p>
          </template>
          <div class="idt-form-grid">
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
            <div v-else class="idt-assign">
              <span>Agente asignado</span>
              <button v-if="!inc.agenteId" class="idt-btn primary" type="button" :disabled="busy" @click="change({ idAgente: user.id }, 'Ahora atiendes esta incidencia.')">Tomar esta incidencia</button>
              <button v-else-if="inc.agenteId === user.id" class="idt-btn" type="button" :disabled="busy" @click="change({ idAgente: null }, 'Soltaste la incidencia; volvió a la cola.')">Soltar (devolver a la cola)</button>
              <strong v-else>{{ inc.agente }}</strong>
            </div>
          </div>
        </section>

        <section v-if="inc.acciones.transferir" class="idt-block">
          <details>
            <summary>Transferir a otro departamento</summary>
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
              <button class="idt-btn primary" type="submit" :disabled="busy">Transferir</button>
              <p v-if="error && feedbackAt === 'transfer'" class="idt-alert error" role="alert">{{ error }}</p>
            </form>
          </details>
        </section>

        <section class="idt-block">
          <h3>Comentarios ({{ inc.comentarios.length }})</h3>
          <p v-if="!inc.comentarios.length" class="idt-muted">Aún no hay comentarios.</p>
          <article v-for="c in inc.comentarios" :key="c.id" class="idt-comment" :class="{ internal: c.esInterno, resolution: c.esResolucion }">
            <header>
              <strong>{{ c.autor }}</strong><span>{{ c.autorRol }} · {{ formatDateTime(c.fecha) }}</span>
              <em v-if="c.esInterno">Nota interna</em><em v-if="c.esResolucion">Resolución</em>
            </header>
            <p class="idt-text">{{ c.contenido }}</p>
          </article>
          <form v-if="inc.acciones.comentar" class="idt-form" @submit.prevent="sendComment">
            <label>Nuevo comentario<textarea v-model="comment.contenido" required maxlength="5000" placeholder="Escribe un comentario…" /></label>
            <div v-if="inc.acciones.comentarioInterno" class="idt-radios" role="radiogroup" aria-label="Tipo de comentario">
              <label><input v-model="comment.tipo" type="radio" value="publico" /> Público</label>
              <label><input v-model="comment.tipo" type="radio" value="interno" /> Nota interna (no la ve el solicitante)</label>
              <label><input v-model="comment.tipo" type="radio" value="resolucion" /> Comentario de resolución</label>
            </div>
            <button class="idt-btn primary" type="submit" :disabled="busy">Agregar comentario</button>
            <template v-if="feedbackAt === 'comments'">
              <p v-if="error" class="idt-alert error" role="alert">{{ error }}</p>
              <p v-if="notice && !error" class="idt-alert ok" role="status">{{ notice }}</p>
            </template>
          </form>
        </section>

        <section v-if="inc.transferencias.length" class="idt-block">
          <h3>Transferencias</h3>
          <ol class="idt-timeline">
            <li v-for="t in inc.transferencias" :key="t.id">
              <span>{{ formatDateTime(t.fecha) }} · {{ t.usuario }}</span>
              <p>{{ t.origen }} → {{ t.destino }}: {{ t.motivo }}</p>
            </li>
          </ol>
        </section>

        <section class="idt-block">
          <h3>Historial</h3>
          <ol class="idt-timeline">
            <li v-for="h in inc.historial" :key="h.id">
              <span>{{ formatDateTime(h.fecha) }}{{ h.responsable ? ` · ${h.responsable}` : '' }}</span>
              <p>{{ historyText(h) }}</p>
            </li>
          </ol>
        </section>
      </template>
  </article>
</template>

<style scoped>
.idt-page{--idt-card:var(--role-card,#fff);--idt-bg:var(--role-field,#f8fafc);--idt-text:var(--role-text,#172033);--idt-muted:var(--role-muted,#64748b);--idt-border:var(--role-border,#e3e9f2);--idt-primary:var(--role-primary,#2563eb)}
.idt-page,.idt-page *{box-sizing:border-box}
.idt-page{width:100%;max-width:1000px;padding:28px;border:1px solid var(--idt-border);border-radius:14px;background:var(--idt-card);color:var(--idt-text);box-shadow:var(--role-shadow,none);font-family:Arial,sans-serif}
.idt-header{display:flex;justify-content:space-between;gap:16px;padding-bottom:16px;border-bottom:1px solid var(--idt-border)}
.idt-header h1{margin:6px 0 0;color:var(--idt-text);font-size:26px;font-weight:700;line-height:1.25;overflow-wrap:anywhere}
.idt-kicker{color:var(--idt-primary);font-size:10px;font-weight:800;letter-spacing:1.2px}
.idt-alert{margin:14px 0 0;padding:10px 12px;border-radius:8px;font-size:13px;line-height:1.5}
.idt-alert.error{background:#fee2e2;color:#991b1b}.idt-alert.ok{background:#dcfce7;color:#166534}
.idt-muted{margin:8px 0 0;color:var(--idt-muted);font-size:12px;line-height:1.5}
.idt-tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
.idt-pill{padding:5px 9px;border-radius:999px;background:var(--idt-bg);color:var(--idt-muted);font-size:11px;font-weight:800}
.st-pendiente{background:#fef3c7;color:#a16207}.st-en-proceso{background:#dbeafe;color:#1d4ed8}.st-resuelto{background:#dcfce7;color:#15803d}.st-cerrado{background:#e2e8f0;color:#334155}.st-rechazado{background:#fee2e2;color:#b91c1c}
.pr-baja{background:#dbeafe;color:#1d4ed8}.pr-media{background:#fef3c7;color:#b45309}.pr-alta{background:#ffedd5;color:#c2410c}.pr-critica{background:#fee2e2;color:#b91c1c}
.idt-pill.late{background:#b91c1c;color:#fff}
.idt-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:16px 0 0}
.idt-grid div{padding:10px 12px;border:1px solid var(--idt-border);border-radius:9px;background:var(--idt-bg)}
.idt-grid dt{color:var(--idt-muted);font-size:10px}.idt-grid dd{margin:5px 0 0;font-size:12px;font-weight:700;overflow-wrap:anywhere}.idt-grid small{color:var(--idt-muted);font-weight:400}
.idt-block{margin-top:20px;padding-top:16px;border-top:1px solid var(--idt-border)}
.idt-block h3{margin:0 0 10px;font-size:13px}
.idt-text{margin:0;color:var(--idt-text);font-size:13px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}
.idt-buttons{display:flex;flex-wrap:wrap;gap:8px}
.idt-btn{padding:9px 13px;border:1px solid var(--idt-border);border-radius:8px;background:var(--idt-bg);color:var(--idt-text);cursor:pointer;font-size:13px;font-weight:700}
.idt-btn:hover:not(:disabled),.idt-btn.active{border-color:var(--idt-primary);color:var(--idt-primary)}
.idt-btn.primary{border-color:var(--idt-primary);background:var(--idt-primary);color:#fff}
.idt-btn.danger{color:#b91c1c}.idt-btn:disabled{opacity:.6;cursor:wait}
.idt-form{display:flex;flex-direction:column;gap:10px;margin-top:12px}
.idt-form label,.idt-form-grid label,.idt-assign{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:700}
.idt-form textarea,.idt-form select,.idt-form-grid select{width:100%;padding:10px 11px;border:1px solid var(--idt-border);border-radius:8px;background:var(--idt-bg);color:var(--idt-text);font:inherit;font-size:13px}
.idt-form textarea{min-height:84px;resize:vertical}
.idt-form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.idt-assign strong{padding:10px 0;font-size:13px}
.idt-radios{display:flex;flex-wrap:wrap;gap:6px 16px}.idt-radios label{flex-direction:row;align-items:center;gap:6px;font-weight:400}
details summary{cursor:pointer;font-size:13px;font-weight:700;color:var(--idt-primary)}
.idt-comment{margin-bottom:10px;padding:11px 13px;border:1px solid var(--idt-border);border-radius:10px}
.idt-comment.internal{border-style:dashed;background:rgba(234,179,8,.08)}.idt-comment.resolution{border-color:#86efac;background:rgba(34,197,94,.08)}
.idt-comment header{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px;margin-bottom:6px;font-size:12px}
.idt-comment header span{color:var(--idt-muted);font-size:11px}.idt-comment em{font-style:normal;font-size:10px;font-weight:800;color:var(--idt-primary)}
.idt-timeline{display:flex;flex-direction:column;gap:8px;margin:0;padding:0;list-style:none}
.idt-timeline li{padding:9px 12px;border-left:3px solid #93c5fd;background:var(--idt-bg)}
.idt-timeline span{color:var(--idt-muted);font-size:11px;font-weight:700}.idt-timeline p{margin:4px 0 0;font-size:13px;line-height:1.5;overflow-wrap:anywhere}
@media(max-width:720px){.idt-page{padding:18px 16px}.idt-grid{grid-template-columns:1fr 1fr}.idt-form-grid{grid-template-columns:1fr}}
@media(max-width:420px){.idt-grid{grid-template-columns:1fr}}
</style>
