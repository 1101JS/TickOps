<script setup>
import { onMounted, ref } from 'vue'
import '../styles/LandingView.css'
import ThemeSwitcher from '../../../components/ThemeSwitcher.vue'

const stats = ref([0, 0, 0])

onMounted(() => {
  const el = document.querySelector('.trust-metrics')
  if (!el) return

  new IntersectionObserver(([entry], observer) => {
    if (!entry.isIntersecting) return

    const start = performance.now()
    const target = [3, 1, 0]

    const run = (now) => {
      const progress = Math.min((now - start) / 900, 1)
      const ease = 1 - (1 - progress) ** 3
      stats.value = target.map((value) => Math.round(value * ease))

      if (progress < 1) requestAnimationFrame(run)
    }

    requestAnimationFrame(run)
    observer.disconnect()
  }, { threshold: 0.3 }).observe(el)
})
</script>

<template>
  <main class="landing-page">
    <header class="landing-navbar">
      <RouterLink to="/" class="brand">
        <span class="brand-mark">T</span>
        Tick<span>Ops</span>
      </RouterLink>

      <nav class="landing-nav">
        <a href="#como-funciona">Cómo funciona</a>
        <a href="#roles">Para cada equipo</a>
        <a href="#servicio">El servicio</a>
      </nav>

      <ThemeSwitcher class="landing-theme" />
      <a href="#contacto" class="help-portal">Solicitar información ↗</a>
    </header>

    <section class="landing-hero">
      <div class="hero-content">
        <div class="hero-eyebrow">
          <span class="eyebrow-dot"></span>
          GESTIÓN DE SOPORTE TÉCNICO · TICKOPS
        </div>

        <h1>El soporte técnico de tu organización, <span>bajo control.</span></h1>

        <p class="hero-description">
          Centraliza solicitudes, organiza incidencias y da seguimiento a cada
          solución desde un solo sistema. Menos desorden, más control del soporte.
        </p>

        <div class="hero-actions">
          <a href="#contacto" class="hero-primary-button">
            <span class="ms-icon">▦</span>
            Conocer TickOps
          </a>
          <RouterLink to="/login" class="hero-secondary-button">
            Acceso al sistema →
          </RouterLink>
        </div>

        <div class="hero-proof">
          <div class="proof-avatars"><span>✓</span></div>
          <p>
            <strong>Un sistema para todo el equipo.</strong><br>
            Solicitudes, asignaciones y seguimiento en un mismo lugar.
          </p>
        </div>
      </div>

      <div class="hero-visual">
        <div class="visual-orbit orbit-one"></div>
        <div class="visual-orbit orbit-two"></div>

        <div class="floating-chip chip-top">
          <span class="chip-icon">✓</span>
          <span>
            <strong>Incidencia registrada</strong>
            <small>Lista para revisión del equipo</small>
          </span>
        </div>

        <div class="dashboard-card">
          <div class="dashboard-top">
            <div class="mini-brand">
              <span class="mini-logo">T</span>
              <span>TickOps <small>SOPORTE TÉCNICO</small></span>
            </div>
            <span class="live-tag"><i></i> Centro de soporte</span>
          </div>

          <div class="dashboard-title">
            <div>
              <small>RESUMEN DEL SERVICIO</small>
              <h2>¿Qué necesitas resolver?</h2>
            </div>
            <span class="date-pill">Panel</span>
          </div>

          <div class="quick-action">
            <span class="quick-icon">＋</span>
            <span>
              <strong>Crear nuevo reporte</strong>
              <small>Describe el problema y envíalo a soporte</small>
            </span>
            <b>→</b>
          </div>

          <div class="ticket-title">
            <strong>Seguimiento de incidencias</strong>
            <a href="#como-funciona">Ver proceso</a>
          </div>

          <div class="ticket-row">
            <span class="ticket-symbol symbol-blue">⌘</span>
            <span class="ticket-copy">
              <strong>Problema de acceso</strong>
              <small>Ticket #0248 · Sistemas</small>
            </span>
            <span class="status-pill status-cycle"><i>En proceso</i></span>
          </div>

          <div class="ticket-row">
            <span class="ticket-symbol symbol-green">⌁</span>
            <span class="ticket-copy">
              <strong>Conexión de red</strong>
              <small>Ticket #0239 · Infraestructura</small>
            </span>
            <span class="status-pill status-done">Resuelta</span>
          </div>

          <div class="progress-line"><span></span></div>
          <small class="dashboard-note">Cada solicitud tiene un estado y un historial.</small>
        </div>

        <div class="floating-chip chip-bottom">
          <span class="bolt">↗</span>
          <span>
            <strong>Trabajo organizado</strong>
            <small>El equipo sabe qué sigue</small>
          </span>
        </div>
      </div>
    </section>

    <section id="servicio" class="knowledge-section">
      <div class="knowledge-content">
        <span class="section-eyebrow">SOPORTE CENTRALIZADO</span>
        <h2>Todo empieza con un reporte. Todo avanza con seguimiento.</h2>
        <p>
          TickOps convierte las solicitudes de soporte en tickets organizados,
          con responsables, estados e historial para que ninguna incidencia
          quede perdida entre mensajes.
        </p>
        <a href="#como-funciona" class="knowledge-search">
          <span>＋</span>
          <strong>Conoce cómo funciona el servicio</strong>
          <b>→</b>
        </a>
      </div>
    </section>

    <section id="metricas" class="trust-metrics">
      <div>
        <strong>{{ stats[0] }}</strong>
        <span>perfiles de acceso</span>
      </div>
      <div>
        <strong>{{ stats[1] }}</strong>
        <span>plataforma centralizada</span>
      </div>
      <div>
        <strong>{{ stats[2] }}</strong>
        <span>dependencia de una institución específica</span>
      </div>
    </section>

    <section id="roles" class="benefits-section">
      <div class="section-heading">
        <span class="section-eyebrow">UN SISTEMA, TRES PERFILES</span>
        <h2>Cada persona tiene las herramientas <span>que necesita.</span></h2>
        <p>
          Los permisos se organizan según la responsabilidad de cada usuario
          dentro del servicio de soporte.
        </p>
      </div>

      <div class="benefits-grid">
        <article class="benefit-card">
          <span class="card-number">01</span>
          <div class="benefit-icon icon-report">⌂</div>
          <h3>Administrador</h3>
          <p>
            Supervisa la operación, administra usuarios y agentes, distribuye
            incidencias y mantiene el control general del servicio.
          </p>
          <span class="card-link">Control y administración</span>
        </article>

        <article class="benefit-card">
          <span class="card-number">02</span>
          <div class="benefit-icon icon-track">◎</div>
          <h3>Agente</h3>
          <p>
            Atiende la cola de su departamento, documenta el avance y puede
            transferir incidencias al área que corresponda.
          </p>
          <span class="card-link">Atención y seguimiento</span>
        </article>

        <article class="benefit-card">
          <span class="card-number">03</span>
          <div class="benefit-icon icon-history">＋</div>
          <h3>Usuario final</h3>
          <p>
            Registra solicitudes de soporte y consulta el seguimiento de sus
            propios reportes, sin acceder a funciones administrativas.
          </p>
          <span class="card-link">Crear y consultar reportes</span>
        </article>
      </div>
    </section>

    <section id="como-funciona" class="benefits-section">
      <div class="section-heading">
        <span class="section-eyebrow">UN FLUJO CLARO</span>
        <h2>De una solicitud a una <span>solución documentada.</span></h2>
        <p>
          Un proceso simple para registrar, atender y cerrar incidencias con
          información disponible para las personas autorizadas.
        </p>
      </div>

      <div class="benefits-grid">
        <article class="benefit-card">
          <span class="card-number">01</span>
          <div class="benefit-icon icon-report">＋</div>
          <h3>Registra</h3>
          <p>
            El solicitante o un agente crea un ticket con los detalles necesarios
            para identificar el problema.
          </p>
          <span class="card-link">La solicitud queda registrada</span>
        </article>

        <article class="benefit-card">
          <span class="card-number">02</span>
          <div class="benefit-icon icon-track">◎</div>
          <h3>Gestiona</h3>
          <p>
            El equipo autorizado revisa, asigna y actualiza el estado de cada
            incidencia durante su atención.
          </p>
          <span class="card-link">Cada avance queda documentado</span>
        </article>

        <article class="benefit-card">
          <span class="card-number">03</span>
          <div class="benefit-icon icon-history">✓</div>
          <h3>Resuelve</h3>
          <p>
            La solución y el historial permanecen asociados al ticket para
            facilitar consultas y seguimiento posterior.
          </p>
          <span class="card-link">Historial en un solo lugar</span>
        </article>
      </div>
    </section>

    <section id="contacto" class="closing-cta">
      <div class="cta-glow"></div>
      <div class="cta-content">
        <span class="section-eyebrow">TICKOPS PARA TU ORGANIZACIÓN</span>
        <h2>Tu equipo necesita soporte.<br><span>Tu organización necesita control.</span></h2>
        <p>
          Conoce cómo implementar TickOps como servicio de soporte técnico
          para tu organización, con acceso local para sus usuarios y equipo.
        </p>
        <a href="mailto:contacto@tickops.com" class="cta-button">
          Solicitar información <span>→</span>
        </a>
      </div>
      <div class="cta-mark">T</div>
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
