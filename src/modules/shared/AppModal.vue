<script setup>
// Ventana emergente para las opciones adicionales (comentar, transferir, crear...), que así no ocupan la pantalla.
// Usa los colores del portal (--role-*) o del panel de administración (--dash-*). Se cierra con Esc o la ×.
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  title: { type: String, required: true },
  kicker: { type: String, default: '' },
  wide: { type: Boolean, default: false }
})
const emit = defineEmits(['close'])
const panel = ref(null)

function onKey(event) {
  if (event.key === 'Escape') emit('close')
}

onMounted(async () => {
  window.addEventListener('keydown', onKey)
  await nextTick()
  // Lleva el foco al primer campo (o a la ventana) para poder escribir de inmediato.
  const field = panel.value?.querySelector('input:not([type=hidden]):not([type=radio]):not([type=checkbox]),select,textarea')
  ;(field || panel.value)?.focus()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="app-modal-backdrop" @click.self="emit('close')">
    <section ref="panel" class="app-modal" :class="{ wide: props.wide }" role="dialog" aria-modal="true" :aria-label="title" tabindex="-1">
      <header class="app-modal-header">
        <div><span v-if="kicker" class="app-modal-kicker">{{ kicker }}</span><h2>{{ title }}</h2></div>
        <button class="app-modal-close" type="button" aria-label="Cerrar" @click="emit('close')">×</button>
      </header>
      <div class="app-modal-body"><slot /></div>
    </section>
  </div>
</template>

<style scoped>
.app-modal-backdrop{position:fixed;z-index:60;inset:0;display:grid;place-items:center;padding:20px;background:rgba(8,20,40,.52);backdrop-filter:blur(3px)}
.app-modal{width:min(100%,560px);max-height:90vh;overflow:auto;padding:22px 24px 24px;border:1px solid var(--role-border,var(--dash-border,#e3e9f2));border-radius:16px;background:var(--role-card,var(--dash-card,#fff));color:var(--role-text,var(--dash-text,#172033));box-shadow:0 28px 90px rgba(8,20,40,.3);font-family:Arial,sans-serif}
.app-modal.wide{width:min(100%,760px)}
.app-modal:focus{outline:none}
.app-modal-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding-bottom:14px;border-bottom:1px solid var(--role-border,var(--dash-border,#e3e9f2))}
.app-modal-header h2{margin:5px 0 0;color:inherit;font-size:19px;line-height:1.3}
.app-modal-kicker{color:var(--role-primary,var(--dash-primary,#2563eb));font-size:10px;font-weight:800;letter-spacing:1.2px}
.app-modal-close{flex:0 0 34px;width:34px;height:34px;border:1px solid var(--role-border,var(--dash-border,#e3e9f2));border-radius:8px;background:var(--role-field,var(--dash-bg,#f8fafc));color:var(--role-muted,var(--dash-muted,#64748b));font-size:21px;line-height:1;cursor:pointer}
.app-modal-body{padding-top:16px}
@media(max-width:560px){.app-modal-backdrop{place-items:end stretch;padding:0}.app-modal{width:100%;max-height:88vh;border-radius:16px 16px 0 0;padding:18px 16px calc(20px + env(safe-area-inset-bottom))}}
</style>
