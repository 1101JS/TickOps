<script setup>
// Recuadros de estado seleccionables (Pendiente, En Proceso, Resuelto...): muestran cuántas incidencias hay en cada
// apartado y, al pulsarlos, filtran la lista. Conservan su color; el elegido se resalta.
// options: [{ key, label, count, tone, hint? }]  tone: open | pendiente | en-proceso | resuelto | cerrado | rechazado | late | unassigned | all
defineProps({
  options: { type: Array, required: true },
  modelValue: { type: String, required: true },
  label: { type: String, default: 'Filtrar por estado' }
})
const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <div class="status-cards" role="group" :aria-label="label">
    <button
      v-for="o in options" :key="o.key" type="button" class="status-card" :class="[`tone-${o.tone}`, { selected: modelValue === o.key }]"
      :aria-pressed="modelValue === o.key" @click="emit('update:modelValue', o.key)"
    >
      <span class="status-card-label">{{ o.label }}</span>
      <strong>{{ o.count }}</strong>
      <small v-if="o.hint">{{ o.hint }}</small>
    </button>
  </div>
</template>

<style scoped>
/* Colores por apartado: fondo suave, borde y número en el color del estado. Funciona en los portales (--role-*)
   y en el panel de administración (--dash-*). */
.status-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:10px;margin:0 0 18px}
.status-card{--tone:#2563eb;--tone-soft:rgba(37,99,235,.08);position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:3px;min-width:0;padding:12px 14px 12px 16px;border:1px solid var(--role-border,var(--dash-border,#e3e9f2));border-radius:11px;background:linear-gradient(var(--tone-soft),var(--tone-soft)),var(--role-card,var(--dash-card,#fff));color:var(--role-text,var(--dash-text,#172033));cursor:pointer;font:inherit;text-align:left;overflow:hidden;transition:border-color .15s,box-shadow .15s,transform .15s}
.status-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--tone)}
.status-card:hover{border-color:var(--tone);transform:translateY(-1px)}
.status-card:focus-visible{outline:2px solid var(--tone);outline-offset:2px}
.status-card.selected{--tone-soft:var(--tone-strong-soft);border-color:var(--tone);box-shadow:0 0 0 2px var(--tone) inset}
.status-card.selected::after{content:'✓';position:absolute;top:8px;right:10px;color:var(--tone);font-size:12px;font-weight:800}
.status-card-label{max-width:100%;color:var(--role-muted,var(--dash-muted,#64748b));font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.status-card.selected .status-card-label{color:var(--tone)}
.status-card strong{color:var(--tone);font-size:24px;line-height:1.1}
.status-card small{color:var(--role-muted,var(--dash-muted,#64748b));font-size:10px}
.tone-open{--tone:#2563eb;--tone-strong-soft:rgba(37,99,235,.16)}
.tone-pendiente{--tone:#d97706;--tone-soft:rgba(245,158,11,.09);--tone-strong-soft:rgba(245,158,11,.2)}
.tone-en-proceso{--tone:#2563eb;--tone-soft:rgba(59,130,246,.08);--tone-strong-soft:rgba(59,130,246,.18)}
.tone-resuelto{--tone:#16a34a;--tone-soft:rgba(34,197,94,.08);--tone-strong-soft:rgba(34,197,94,.18)}
.tone-cerrado{--tone:#475569;--tone-soft:rgba(100,116,139,.08);--tone-strong-soft:rgba(100,116,139,.18)}
.tone-rechazado{--tone:#dc2626;--tone-soft:rgba(239,68,68,.07);--tone-strong-soft:rgba(239,68,68,.16)}
.tone-late{--tone:#b91c1c;--tone-soft:rgba(185,28,28,.08);--tone-strong-soft:rgba(185,28,28,.18)}
.tone-unassigned{--tone:#ea580c;--tone-soft:rgba(249,115,22,.08);--tone-strong-soft:rgba(249,115,22,.18)}
.tone-all{--tone:#7c3aed;--tone-soft:rgba(124,58,237,.06);--tone-strong-soft:rgba(124,58,237,.15)}
:root[data-theme="dark"] .tone-pendiente{--tone:#fbbf24}
:root[data-theme="dark"] .tone-open,:root[data-theme="dark"] .tone-en-proceso{--tone:#60a5fa}
:root[data-theme="dark"] .tone-resuelto{--tone:#4ade80}
:root[data-theme="dark"] .tone-cerrado{--tone:#cbd5e1}
:root[data-theme="dark"] .tone-rechazado,:root[data-theme="dark"] .tone-late{--tone:#f87171}
:root[data-theme="dark"] .tone-unassigned{--tone:#fb923c}
:root[data-theme="dark"] .tone-all{--tone:#a78bfa}
@media(max-width:560px){.status-cards{grid-template-columns:repeat(2,minmax(0,1fr))}.status-card strong{font-size:20px}}
</style>
