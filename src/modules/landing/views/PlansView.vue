<script setup>
import { ref } from 'vue'
import '../styles/LandingView.css'
import '../styles/PlansView.css'
import ThemeSwitcher from '../../../components/ThemeSwitcher.vue'

// Todo lo que TickOps ya hace hoy (ver PROGRESO.txt). Si se agrega una función, se suma aquí.
const featureGroups = [
  {
    icon: '＋',
    tone: 'icon-report',
    title: 'Registro de incidencias',
    items: [
      'Tickets con categoría, prioridad y departamento',
      'Archivos adjuntos con vista previa de imágenes',
      'Portal propio para cada solicitante',
      'Seguimiento del estado en todo momento'
    ]
  },
  {
    icon: '◎',
    tone: 'icon-track',
    title: 'Atención y seguimiento',
    items: [
      'Cola de trabajo por departamento para los agentes',
      'Asignación y transferencia entre áreas',
      'Comentarios públicos, internos y de resolución',
      'Historial completo de cada cambio'
    ]
  },
  {
    icon: '⏱',
    tone: 'icon-history',
    title: 'Tiempos de respuesta (SLA)',
    items: [
      'Cuatro niveles de prioridad con su propio plazo',
      'Aviso de incidencias con el SLA vencido',
      'Las incidencias cerradas quedan como solo lectura',
      'Reglas del proceso aplicadas por el sistema'
    ]
  },
  {
    icon: '▦',
    tone: 'icon-report',
    title: 'Panel del administrador',
    items: [
      'Indicadores: abiertas, sin asignar, SLA vencido y resueltas',
      'Filtros por estado, prioridad, departamento, categoría y fechas',
      'Reportes exportables a Excel y PDF',
      'Gestión de usuarios, agentes y categorías'
    ]
  },
  {
    icon: '⌂',
    tone: 'icon-track',
    title: 'Seguridad y permisos',
    items: [
      'Tres perfiles: administrador, agente y solicitante',
      'Cada persona ve solo lo que le corresponde',
      'Contraseñas cifradas y sesiones protegidas',
      'Validación del tipo real de cada archivo subido'
    ]
  },
  {
    icon: '✓',
    tone: 'icon-history',
    title: 'Respaldo y continuidad',
    items: [
      'Respaldo automático diario de la base de datos',
      'Copias cifradas, guardadas en local y en la nube',
      'Incluye los archivos adjuntos',
      'Modo claro y oscuro en todo el sistema'
    ]
  }
]

// Precios en dólares estadounidenses. Para cambiarlos, editar solo esta lista.
const plans = [
  {
    id: 'mensual',
    name: 'Mensual',
    price: '19',
    period: '/ mes',
    note: 'Sin permanencia. Cancela cuando quieras.',
    perks: [
      'Todas las funciones del sistema',
      'Usuarios y agentes ilimitados',
      'Respaldo automático diario',
      'Actualizaciones incluidas',
      'Soporte por correo'
    ]
  },
  {
    id: 'anual',
    name: 'Anual',
    price: '190',
    period: '/ año',
    note: 'Equivale a $15.83 al mes: dos meses gratis.',
    badge: 'Más elegido',
    featured: true,
    perks: [
      'Todo lo del plan mensual',
      'Dos meses sin costo',
      'Ayuda con la configuración inicial',
      'Soporte prioritario'
    ]
  },
  {
    id: 'vitalicia',
    name: 'Licencia de por vida',
    price: '1,499',
    period: 'pago único',
    note: 'Un solo pago. El sistema es tuyo para siempre.',
    perks: [
      'Todas las funciones, sin pagos recurrentes',
      'Instalación en el servidor de tu organización',
      'Actualizaciones de por vida',
      'Migración de datos y capacitación del equipo',
      'Soporte prioritario de por vida'
    ]
  }
]

const faqs = [
  {
    q: '¿Qué incluye cada plan?',
    a: 'Los tres planes incluyen todas las funciones de TickOps. Cambia la forma de pago y el nivel de acompañamiento.'
  },
  {
    q: '¿Hay límite de usuarios o incidencias?',
    a: 'No. Puedes registrar a todo tu equipo y todas las incidencias que necesites.'
  },
  {
    q: '¿Puedo cambiar de plan más adelante?',
    a: 'Sí. Puedes pasar del plan mensual al anual, o a la licencia de por vida, sin perder tus datos.'
  },
  {
    q: '¿Mis datos están respaldados?',
    a: 'Sí. TickOps hace un respaldo cifrado cada día, que incluye los archivos adjuntos.'
  }
]

const selectedPlan = ref(null)

const choosePlan = (plan) => {
  selectedPlan.value = plan
  document.getElementById('contratar')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
</script>

<template>
  <main class="landing-page plans-page">
    <header class="landing-navbar">
      <RouterLink to="/" class="brand">
        <span class="brand-mark">T</span>
        Tick<span>Ops</span>
      </RouterLink>

      <nav class="landing-nav">
        <a href="#funciones">Funciones</a>
        <a href="#precios">Precios</a>
        <a href="#preguntas">Preguntas</a>
      </nav>

      <ThemeSwitcher class="landing-theme" />
      <RouterLink to="/login" class="help-portal">Acceso al sistema ↗</RouterLink>
    </header>

    <section class="plans-hero">
      <span class="section-eyebrow">TICKOPS PARA TU ORGANIZACIÓN</span>
      <h1>Todo tu soporte técnico, <span>en un solo sistema.</span></h1>
      <p>
        Conoce todo lo que incluye TickOps y elige el plan que mejor se adapta a tu
        organización: una suscripción accesible o una licencia de por vida.
      </p>
      <div class="hero-actions">
        <a href="#precios" class="hero-primary-button">Ver planes y precios</a>
        <a href="#funciones" class="hero-secondary-button">Qué incluye →</a>
      </div>
    </section>

    <section id="funciones" class="benefits-section">
      <div class="section-heading">
        <span class="section-eyebrow">LO QUE OFRECE TICKOPS</span>
        <h2>Funciones pensadas para <span>todo el equipo.</span></h2>
        <p>Todas están incluidas en cualquier plan, sin módulos de pago por separado.</p>
      </div>

      <div class="benefits-grid">
        <article v-for="group in featureGroups" :key="group.title" class="benefit-card feature-card">
          <div class="benefit-icon" :class="group.tone">{{ group.icon }}</div>
          <h3>{{ group.title }}</h3>
          <ul class="feature-list">
            <li v-for="item in group.items" :key="item">{{ item }}</li>
          </ul>
        </article>
      </div>
    </section>

    <section id="precios" class="benefits-section pricing-section">
      <div class="section-heading">
        <span class="section-eyebrow">PLANES Y PRECIOS</span>
        <h2>Elige cómo quieres <span>usar TickOps.</span></h2>
        <p>Precios en dólares estadounidenses (USD).</p>
      </div>

      <div class="pricing-grid">
        <article
          v-for="plan in plans"
          :key="plan.id"
          class="price-card"
          :class="{ 'is-featured': plan.featured, 'is-selected': selectedPlan?.id === plan.id }"
        >
          <span v-if="plan.badge" class="price-badge">{{ plan.badge }}</span>
          <h3>{{ plan.name }}</h3>
          <div class="price-amount">
            <span class="price-currency">$</span>
            <strong>{{ plan.price }}</strong>
            <span class="price-period">{{ plan.period }}</span>
          </div>
          <p class="price-note">{{ plan.note }}</p>
          <ul class="feature-list">
            <li v-for="perk in plan.perks" :key="perk">{{ perk }}</li>
          </ul>
          <button type="button" class="price-button" @click="choosePlan(plan)">
            {{ selectedPlan?.id === plan.id ? 'Plan elegido ✓' : 'Elegir este plan' }}
          </button>
        </article>
      </div>

      <div id="contratar" class="plan-summary" aria-live="polite">
        <template v-if="selectedPlan">
          <strong>Elegiste: {{ selectedPlan.name }} · ${{ selectedPlan.price }} {{ selectedPlan.period }}</strong>
          <p>La contratación en línea estará disponible muy pronto.</p>
        </template>
        <p v-else>Elige un plan para ver el resumen de tu contratación.</p>
      </div>
    </section>

    <section id="preguntas" class="benefits-section faq-section">
      <div class="section-heading">
        <span class="section-eyebrow">PREGUNTAS FRECUENTES</span>
        <h2>Antes de <span>contratar.</span></h2>
      </div>

      <div class="faq-list">
        <details v-for="faq in faqs" :key="faq.q" class="faq-item">
          <summary>{{ faq.q }}</summary>
          <p>{{ faq.a }}</p>
        </details>
      </div>
    </section>

    <footer class="landing-footer">
      <RouterLink to="/" class="footer-brand">
        <span class="footer-logo">T</span>
        TickOps
      </RouterLink>
      <p>Gestión de tickets y soporte técnico para organizaciones.</p>
      <span>© 2026 TickOps</span>
    </footer>
  </main>
</template>
