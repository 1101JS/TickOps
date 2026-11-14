
import { createApp } from 'vue'
import './style.css'

import App from './App.vue'
import router from './router'
import ThemeService from './services/ThemeService.js'

// Inicializar preferencia visual
ThemeService.InitializeTheme()

// Inicializar aplicación
createApp(App)
  .use(router)
  .mount('#app')
