<script setup>
// Formulario para registrar una incidencia (con adjuntos opcionales). Lo usan el solicitante, el agente y el
// administrador —también en sus vistas de agente o solicitante—: la incidencia queda a nombre de quien la envía.
import { computed, onMounted, ref } from 'vue'
import {
  ATTACHMENT_EXTENSIONS, categoriesByDepartment, checkAttachments, createIncident, getCatalogs, uploadAttachments
} from '../../../services/IncidentService.js'

defineProps({
  cancelable: { type: Boolean, default: false }
})
// created: (incidencia, problemaConArchivos)
const emit = defineEmits(['created', 'cancel'])

const catalogs = ref({ categorias: [], prioridades: [] })
const defaultPriority = () => catalogs.value.prioridades.find((p) => p.nombre === 'Media')?.id ?? ''
const form = ref({ titulo: '', descripcion: '', idCategoria: '', idPrioridad: '' })
const files = ref([])
const error = ref('')
const sending = ref(false)
const acceptedTypes = ATTACHMENT_EXTENSIONS.join(',')

const groups = computed(() => categoriesByDepartment(catalogs.value.categorias))
const selectedCategory = computed(() => catalogs.value.categorias.find((c) => c.id === Number(form.value.idCategoria)))

function pickFiles(event) {
  files.value = [...event.target.files]
  error.value = checkAttachments(files.value)
}

async function submit() {
  if (sending.value) return
  const problem = checkAttachments(files.value)
  if (problem) {
    error.value = problem
    return
  }
  sending.value = true
  error.value = ''
  try {
    const incident = await createIncident({ ...form.value, idCategoria: Number(form.value.idCategoria), idPrioridad: Number(form.value.idPrioridad) })
    // Los archivos se suben después de crear la incidencia; si fallan, la incidencia ya quedó registrada.
    let filesProblem = ''
    if (files.value.length) await uploadAttachments(incident.id, files.value).catch((err) => { filesProblem = err.message })
    form.value = { titulo: '', descripcion: '', idCategoria: '', idPrioridad: defaultPriority() }
    files.value = []
    emit('created', incident, filesProblem)
  } catch (err) {
    error.value = err.message
  } finally {
    sending.value = false
  }
}

onMounted(async () => {
  try {
    catalogs.value = await getCatalogs()
    if (!form.value.idPrioridad) form.value.idPrioridad = defaultPriority()
  } catch (err) {
    error.value = err.message
  }
})
</script>

<template>
  <form class="nif" @submit.prevent="submit">
    <label>Título<input v-model="form.titulo" maxlength="150" placeholder="Ej. No puedo acceder al sistema" required /></label>
    <div class="nif-two">
      <label>Categoría
        <select v-model="form.idCategoria" required>
          <option value="">Selecciona una opción</option>
          <optgroup v-for="g in groups" :key="g.departamento" :label="g.departamento">
            <option v-for="c in g.items" :key="c.id" :value="c.id">{{ c.nombre }}</option>
          </optgroup>
        </select>
      </label>
      <label>Prioridad
        <select v-model="form.idPrioridad" required>
          <option v-for="p in catalogs.prioridades" :key="p.id" :value="p.id">{{ p.nombre }} · resolver en {{ p.slaResolucionHoras }} h</option>
        </select>
      </label>
    </div>
    <p v-if="selectedCategory" class="nif-hint">{{ selectedCategory.descripcion ? `${selectedCategory.descripcion} · ` : '' }}la atenderá {{ selectedCategory.departamento }}.</p>
    <label>Descripción<textarea v-model="form.descripcion" maxlength="5000" placeholder="Indica qué ocurre, dónde sucede y desde cuándo..." required /></label>
    <label><span class="nif-label">Capturas o archivos <span class="nif-optional">(opcional · hasta 5, máximo 5 MB cada uno)</span></span>
      <input type="file" multiple :accept="acceptedTypes" @change="pickFiles" />
    </label>
    <p v-if="files.length" class="nif-hint">{{ files.length }} archivo(s): {{ files.map((f) => f.name).join(', ') }}</p>
    <p v-if="error" class="nif-error" role="alert">{{ error }}</p>
    <div class="nif-actions">
      <button v-if="cancelable" class="nif-btn" type="button" @click="emit('cancel')">Cancelar</button>
      <button class="nif-btn primary" type="submit" :disabled="sending">{{ sending ? 'Enviando...' : 'Registrar incidencia' }}</button>
    </div>
  </form>
</template>

<style scoped>
.nif{display:flex;flex-direction:column;gap:14px}
.nif label{display:flex;flex-direction:column;gap:7px;color:var(--role-text-soft,var(--dash-text,#334155));font-size:12px;font-weight:700}
.nif input:not([type=file]),.nif select,.nif textarea{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid var(--role-field-border,var(--dash-border,#d8e0eb));border-radius:8px;background:var(--role-field,var(--dash-bg,#f8fafc));color:var(--role-text,var(--dash-text,#172033));font:inherit;font-size:13px}
.nif textarea{min-height:110px;resize:vertical}
.nif input[type=file]{font:inherit;font-size:12px;color:var(--role-text,var(--dash-text,#172033))}
.nif-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.nif-label{display:block}
.nif-optional{color:var(--role-muted,var(--dash-muted,#64748b));font-weight:400}
.nif-hint{margin:-4px 0 0;color:var(--role-muted,var(--dash-muted,#64748b));font-size:12px;line-height:1.5}
.nif-error{margin:0;padding:10px 12px;border-radius:8px;background:#fee2e2;color:#991b1b;font-size:13px}
.nif-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}
.nif-btn{padding:11px 15px;border:1px solid var(--role-field-border,var(--dash-border,#d8e0eb));border-radius:8px;background:var(--role-field,var(--dash-bg,#f8fafc));color:var(--role-text,var(--dash-text,#172033));cursor:pointer;font-size:13px;font-weight:700}
.nif-btn.primary{border-color:transparent;background:var(--role-primary,var(--dash-primary,#2563eb));color:#fff}
.nif-btn:disabled{opacity:.6;cursor:wait}
@media(max-width:560px){.nif-two{grid-template-columns:1fr}}
</style>
