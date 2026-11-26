<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { exportStatisticsToExcel } from '../../../services/ExportService.js'
import { getAgents, getCatalogs, getStatistics } from '../../../services/IncidentService.js'

// Hoja estadística: resueltas/creadas por agente, departamento, categoría o prioridad en un rango de fechas,
// con comparación opcional contra otro rango (p. ej. este mes contra el anterior).
const GROUP_LABELS = { agente: 'Agente', departamento: 'Departamento', categoria: 'Categoría', prioridad: 'Prioridad' }

const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const today = new Date()
const monthStart = (offset = 0) => new Date(today.getFullYear(), today.getMonth() + offset, 1)
const monthEnd = (offset = 0) => new Date(today.getFullYear(), today.getMonth() + offset + 1, 0)

const catalogs = ref({ departamentos: [], categorias: [], prioridades: [] })
const agents = ref([])
const form = ref({ desde: iso(monthStart()), hasta: iso(today), agrupar: 'agente', idDepartamento: '', idAgente: '', idPrioridad: '' })
const compare = ref(false)
const other = ref({ desde: iso(monthStart(-1)), hasta: iso(monthEnd(-1)) })
const current = ref(null)
const previous = ref(null)
const loading = ref(false)
const error = ref('')
let requestId = 0

const presets = [
  { label: 'Este mes', range: () => [monthStart(), today] },
  { label: 'Mes pasado', range: () => [monthStart(-1), monthEnd(-1)] },
  { label: 'Últimos 30 días', range: () => [new Date(Date.now() - 29 * 864e5), today] },
  { label: 'Este año', range: () => [new Date(today.getFullYear(), 0, 1), today] }
]

function applyPreset(preset, target) {
  const [from, to] = preset.range()
  target.desde = iso(from)
  target.hasta = iso(to)
}

// Período inmediatamente anterior y de la misma duración que el elegido.
function previousPeriod() {
  if (!form.value.desde || !form.value.hasta) return
  const from = new Date(`${form.value.desde}T00:00:00`)
  const days = Math.round((new Date(`${form.value.hasta}T00:00:00`) - from) / 864e5) + 1
  other.value = { desde: iso(new Date(from.getTime() - days * 864e5)), hasta: iso(new Date(from.getTime() - 864e5)) }
}

async function load() {
  const id = ++requestId
  loading.value = true
  error.value = ''
  try {
    const [a, b] = await Promise.all([
      getStatistics({ ...form.value, periodo: 'mes' }),
      compare.value ? getStatistics({ ...form.value, ...other.value, periodo: 'mes' }) : null
    ])
    if (id !== requestId) return
    current.value = a
    previous.value = b
  } catch (e) {
    if (id === requestId) error.value = e.message
  } finally {
    if (id === requestId) loading.value = false
  }
}

// Filas: una por grupo que aparezca en cualquiera de los dos rangos.
const rows = computed(() => {
  if (!current.value) return []
  const map = new Map()
  for (const g of current.value.grupos) map.set(g.clave, { clave: g.clave, nombre: g.nombre, a: g, b: null })
  for (const g of previous.value?.grupos ?? []) {
    if (map.has(g.clave)) map.get(g.clave).b = g
    else map.set(g.clave, { clave: g.clave, nombre: g.nombre, a: null, b: g })
  }
  return [...map.values()].sort((x, y) => (y.a?.resueltas ?? 0) - (x.a?.resueltas ?? 0) || (y.b?.resueltas ?? 0) - (x.b?.resueltas ?? 0))
})
const maxResolved = computed(() => Math.max(1, ...rows.value.flatMap((r) => [r.a?.resueltas ?? 0, r.b?.resueltas ?? 0])))

const delta = (row) => (row.a?.resueltas ?? 0) - (row.b?.resueltas ?? 0)
const signed = (n) => (n > 0 ? `+${n}` : String(n))
const hours = (value) => (value === null || value === undefined ? '—' : value >= 48 ? `${Math.round((value / 24) * 10) / 10} d` : `${value} h`)
const percent = (value) => (value === null || value === undefined ? '—' : `${value} %`)
const range = (r) => `${r.desde || 'inicio'} → ${r.hasta || 'hoy'}`

const departmentAgents = computed(() => agents.value.filter((a) => !form.value.idDepartamento || a.departamentoId === Number(form.value.idDepartamento)))

async function exportExcel() {
  await exportStatisticsToExcel({
    groupLabel: GROUP_LABELS[form.value.agrupar],
    rows: rows.value,
    totals: current.value.totales,
    previousTotals: previous.value?.totales ?? null,
    rangeLabel: range(current.value),
    previousRangeLabel: previous.value ? range(previous.value) : ''
  })
}

watch([form, compare, other], load, { deep: true })
onMounted(async () => {
  const [c, a] = await Promise.all([getCatalogs(), getAgents().catch(() => [])])
  catalogs.value = c
  agents.value = a
  load()
})
</script>

<template>
  <header class="dashboard-header">
    <div><p class="eyebrow">ANÁLISIS</p><h1>Estadísticas</h1><p>Incidencias resueltas por agente, departamento, categoría o prioridad en el rango que elijas.</p></div>
    <button class="primary-button header-action" type="button" :disabled="!current" @click="exportExcel">Exportar a Excel</button>
  </header>

  <section class="card stats-filters">
    <div class="stats-row">
      <label>Desde<input v-model="form.desde" type="date" /></label>
      <label>Hasta<input v-model="form.hasta" type="date" /></label>
      <label>Agrupar por
        <select v-model="form.agrupar"><option v-for="(label, key) in GROUP_LABELS" :key="key" :value="key">{{ label }}</option></select>
      </label>
      <label>Departamento
        <select v-model="form.idDepartamento"><option value="">Todos</option><option v-for="d in catalogs.departamentos" :key="d.id" :value="d.id">{{ d.nombre }}</option></select>
      </label>
      <label>Agente
        <select v-model="form.idAgente"><option value="">Todos</option><option value="0">Sin asignar</option><option v-for="a in departmentAgents" :key="a.id" :value="a.id">{{ a.nombre }}</option></select>
      </label>
      <label>Prioridad
        <select v-model="form.idPrioridad"><option value="">Todas</option><option v-for="p in catalogs.prioridades" :key="p.id" :value="p.id">{{ p.nombre }}</option></select>
      </label>
    </div>
    <div class="stats-presets">
      <span>Rango rápido:</span>
      <button v-for="p in presets" :key="p.label" type="button" class="secondary-button" @click="applyPreset(p, form)">{{ p.label }}</button>
    </div>
    <label class="stats-check"><input v-model="compare" type="checkbox" /> Comparar con otro período</label>
    <div v-if="compare" class="stats-row stats-compare">
      <label>Comparar desde<input v-model="other.desde" type="date" /></label>
      <label>Comparar hasta<input v-model="other.hasta" type="date" /></label>
      <button type="button" class="secondary-button" @click="previousPeriod">Período anterior equivalente</button>
      <button v-for="p in presets.slice(0, 2)" :key="p.label" type="button" class="secondary-button" @click="applyPreset(p, other)">{{ p.label }}</button>
    </div>
  </section>

  <p v-if="error" class="form-notice error" role="alert">{{ error }}</p>

  <template v-if="current">
    <div class="overview-grid">
      <div class="overview-card"><span>Resueltas</span><strong>{{ current.totales.resueltas }}</strong>
        <small v-if="previous">antes: {{ previous.totales.resueltas }} ({{ signed(current.totales.resueltas - previous.totales.resueltas) }})</small><small v-else>de {{ current.totales.creadas }} creadas en el rango</small></div>
      <div class="overview-card"><span>Resueltas dentro del SLA</span><strong>{{ percent(current.totales.porcentajeEnTiempo) }}</strong>
        <small v-if="previous">antes: {{ percent(previous.totales.porcentajeEnTiempo) }}</small><small v-else>{{ current.totales.enTiempo }} de {{ current.totales.resueltas }}</small></div>
      <div class="overview-card"><span>Tiempo promedio de resolución</span><strong>{{ hours(current.totales.horasPromedio) }}</strong>
        <small v-if="previous">antes: {{ hours(previous.totales.horasPromedio) }}</small></div>
      <div class="overview-card"><span>Abiertas ahora</span><strong>{{ current.totales.abiertas }}</strong><small>no depende del rango</small></div>
    </div>

    <section class="card">
      <div class="section-heading">
        <div><p class="eyebrow">POR {{ GROUP_LABELS[form.agrupar].toUpperCase() }}</p><h2>Resueltas · {{ range(current) }}</h2>
          <p v-if="previous" class="stats-muted">Comparado con {{ range(previous) }}</p></div>
        <span v-if="loading" class="stats-muted">Actualizando…</span>
      </div>
      <div class="table-wrap">
        <table class="stats-table">
          <thead>
            <tr>
              <th>{{ GROUP_LABELS[form.agrupar] }}</th><th>Resueltas</th><th v-if="previous">Comparado</th><th v-if="previous">Dif.</th>
              <th>Creadas</th><th>% en SLA</th><th>Tiempo prom.</th><th>Abiertas ahora</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.clave">
              <td>{{ row.nombre }}</td>
              <td class="stats-bar-cell">
                <div class="stats-bar"><i :style="{ width: `${((row.a?.resueltas ?? 0) / maxResolved) * 100}%` }" /></div>
                <strong>{{ row.a?.resueltas ?? 0 }}</strong>
              </td>
              <td v-if="previous" class="stats-bar-cell">
                <div class="stats-bar alt"><i :style="{ width: `${((row.b?.resueltas ?? 0) / maxResolved) * 100}%` }" /></div>
                <strong>{{ row.b?.resueltas ?? 0 }}</strong>
              </td>
              <td v-if="previous" :class="{ up: delta(row) > 0, down: delta(row) < 0 }">{{ signed(delta(row)) }}</td>
              <td>{{ row.a?.creadas ?? 0 }}</td>
              <td>{{ percent(row.a?.porcentajeEnTiempo) }}</td>
              <td>{{ hours(row.a?.horasPromedio) }}</td>
              <td>{{ row.a?.abiertas ?? row.b?.abiertas ?? 0 }}</td>
            </tr>
            <tr v-if="!rows.length"><td :colspan="previous ? 8 : 6" class="empty-state">No hay incidencias con estos filtros.</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="current.serie.length" class="card">
      <div class="section-heading"><div><p class="eyebrow">EVOLUCIÓN</p><h2>Creadas y resueltas por mes</h2></div></div>
      <div class="table-wrap">
        <table class="stats-table">
          <thead><tr><th>Mes</th><th>Creadas</th><th>Resueltas</th></tr></thead>
          <tbody><tr v-for="s in current.serie" :key="s.periodo"><td>{{ s.periodo.slice(0, 7) }}</td><td>{{ s.creadas }}</td><td>{{ s.resueltas }}</td></tr></tbody>
        </table>
      </div>
    </section>
  </template>
</template>

<style scoped>
.stats-filters{display:flex;flex-direction:column;gap:14px}
.stats-row{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end}
.stats-row label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--dash-muted)}
.stats-presets{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:12px;color:var(--dash-muted)}
.stats-check{display:flex;align-items:center;gap:8px;font-size:13px}
.stats-compare{padding-top:4px;border-top:1px dashed var(--dash-border)}
.stats-muted{margin:4px 0 0;font-size:12px;color:var(--dash-muted)}
.stats-table{width:100%;border-collapse:collapse;font-size:13px}
.stats-table th,.stats-table td{padding:9px 10px;text-align:left;border-bottom:1px solid var(--dash-border)}
.stats-table th{font-size:11px;color:var(--dash-muted);text-transform:uppercase;letter-spacing:.04em}
.stats-bar-cell{min-width:150px}
.stats-bar{display:inline-block;vertical-align:middle;width:90px;height:8px;margin-right:8px;border-radius:4px;background:var(--dash-border);overflow:hidden}
.stats-bar i{display:block;height:100%;background:var(--dash-primary)}
.stats-bar.alt i{background:#94a3b8}
.up{color:#15803d;font-weight:700}.down{color:#b91c1c;font-weight:700}
</style>
