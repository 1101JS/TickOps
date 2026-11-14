
<script setup>
import { ref } from 'vue'
import ThemeService from '../services/ThemeService.js'

const selectedTheme = ref(
  document.documentElement.getAttribute('data-theme') || 'light'
)

const ToggleTheme = () => {
  selectedTheme.value =
    selectedTheme.value === 'light' ? 'dark' : 'light'

  ThemeService.SetTheme(selectedTheme.value)
}
</script>

<template>
  <button
    class="theme-toggle"
    type="button"
    @click="ToggleTheme"
    :aria-label="selectedTheme === 'light'
      ? 'Activar Dark Mode'
      : 'Activar Light Mode'"
    :aria-pressed="selectedTheme === 'dark'"
  >
    <span class="theme-icon sun-icon">
      <svg viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2 M12 20v2 M4.93 4.93l1.42 1.42
          M17.65 17.65l1.42 1.42 M2 12h2 M20 12h2
          M4.93 19.07l1.42-1.42 M17.65 6.35l1.42-1.42" />
      </svg>
    </span>

    <span class="theme-track">
      <span class="theme-thumb"></span>
    </span>

    <span class="theme-icon moon-icon">
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5
          8.5 8.5 0 1 0 20.5 15.5Z" />
      </svg>
    </span>
  </button>
</template>


<style scoped>
.theme-toggle {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 8px 11px;
  border: 1px solid var(--color-border);
  border-radius: 30px;
  background: #172d50;
  cursor: pointer;
  transition: background 0.25s, border-color 0.25s;
}

.theme-icon {
  width: 19px;
  height: 19px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.4;
  transition: opacity 0.25s;
}

.theme-icon svg {
  width: 19px;
  height: 19px;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sun-icon {
  color: #fbbf24;
}

.moon-icon {
  color: #818cf8;
}

.theme-track {
  width: 36px;
  height: 20px;
  padding: 2px;
  border-radius: 20px;
  background: #64748b;
  box-sizing: border-box;
  transition: background 0.25s;
}

.theme-thumb {
  display: block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ffffff;
  transform: translateX(0);
  transition: transform 0.25s, background 0.25s;
}

/* LIGHT MODE */
.theme-toggle[aria-pressed="false"] {
  background: #172d50;
  border-color: #172d50;
}

.theme-toggle[aria-pressed="false"] .sun-icon {
  opacity: 1;
}

.theme-toggle[aria-pressed="false"] .theme-track {
  background: #64748b;
}

.theme-toggle[aria-pressed="false"] .theme-thumb {
  background: #ffffff;
}

/* DARK MODE */
:global(:root[data-theme="dark"]) .theme-toggle[aria-pressed="true"] {
  background: #ffffff;
  border-color: #ffffff;
}

.theme-toggle[aria-pressed="true"] .moon-icon {
  opacity: 1;
}

.theme-toggle[aria-pressed="true"] .theme-track {
  background: #cbd5e1;
}

.theme-toggle[aria-pressed="true"] .theme-thumb {
  background: #172d50;
  transform: translateX(16px);
}

.theme-toggle:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 3px;
}
</style>

