
<script setup>
import '../styles/LandingView.css'
import ThemeSwitcher from '../../../components/ThemeSwitcher.vue'
</script>

<template>
  <main class="landing-page">

    <!-- NAVBAR -->
    <header class="landing-navbar">
      <RouterLink to="/" class="landing-brand">
        <span class="brand-icon">E</span>
        <span>TickOps</span>
      </RouterLink>

      <nav class="landing-navigation">
        <a href="#beneficios">Beneficios</a>
        <a href="#funcionamiento">Cómo funciona</a>
      </nav>

      <ThemeSwitcher />

      <div class="landing-actions">
        <!-- Conserva tus botones actuales -->
      </div>

      <div class="landing-actions">
        <RouterLink to="/login" class="landing-login">
          Iniciar sesión
        </RouterLink>

        <RouterLink to="/registro" class="landing-register">
          Crear cuenta
        </RouterLink>
      </div>
    </header>

    <!-- HERO -->
    <section class="landing-hero">
      <div class="hero-content">

        <span class="hero-eyebrow">
          SOPORTE TÉCNICO UTH
        </span>

        <h1>
          El soporte técnico,
          <span>ahora más sencillo.</span>
        </h1>

        <p class="hero-description">
          Reporta incidencias, consulta su progreso y mantente
          informado. Todo el soporte técnico de UTH en un solo lugar.
        </p>

        <div class="hero-actions">
          <RouterLink to="/registro" class="hero-primary-button">
            Crear mi cuenta
            <span>→</span>
          </RouterLink>

          <RouterLink to="/login" class="hero-secondary-button">
            Ya tengo una cuenta
          </RouterLink>
        </div>

        <div class="hero-trust">
          <span class="trust-indicator"></span>
          Plataforma de gestión de soporte técnico UTH
        </div>

      </div>

      <!-- PREVIEW DEL SISTEMA -->
      <div class="hero-preview">
        <div class="preview-window">

          <div class="preview-header">
            <div class="preview-brand">
              <span class="preview-brand-icon">E</span>
              ETicket
            </div>

            <span class="preview-status">Panel de ejemplo</span>
          </div>

          <div class="preview-content">
            <div class="preview-heading">
              <div>
                <span class="preview-label">RESUMEN GENERAL</span>
                <h3>Mis incidencias</h3>
              </div>
              <span class="preview-date">Vista previa</span>
            </div>

            <div class="preview-stats">
              <div class="preview-stat">
                <span class="stat-number">04</span>
                <span class="stat-label">Pendientes</span>
              </div>

              <div class="preview-stat">
                <span class="stat-number">08</span>
                <span class="stat-label">En proceso</span>
              </div>

              <div class="preview-stat">
                <span class="stat-number">24</span>
                <span class="stat-label">Resueltas</span>
              </div>
            </div>

            <div class="preview-ticket">
              <div>
                <strong>#104 · Impresora</strong>
                <span>Hardware</span>
              </div>
              <span class="ticket-badge ticket-progress">
                En proceso
              </span>
            </div>

            <div class="preview-ticket">
              <div>
                <strong>#098 · Sistema</strong>
                <span>Software</span>
              </div>
              <span class="ticket-badge ticket-resolved">
                Resuelta
              </span>
            </div>

          </div>
        </div>

        <div class="preview-decoration"></div>
      </div>
    </section>

    <!-- BENEFICIOS -->
    <section id="beneficios" class="landing-benefits">

      <div class="section-heading">
        <span class="section-eyebrow">UNA MEJOR EXPERIENCIA</span>
        <h2>El soporte que necesitas, organizado.</h2>
        <p>
          Simplificamos la comunicación entre quienes necesitan
          soporte y quienes lo proporcionan.
        </p>
      </div>

      <div class="benefits-grid">

        <article class="benefit-card">
          <div class="benefit-icon">＋</div>
          <h3>Reportes sencillos</h3>
          <p>
            Registra tus incidencias proporcionando los detalles
            necesarios para recibir atención.
          </p>
        </article>

        <article class="benefit-card">
          <div class="benefit-icon">↗</div>
          <h3>Seguimiento claro</h3>
          <p>
            Consulta el estado de tus solicitudes y conoce
            el progreso de cada incidencia.
          </p>
        </article>

        <article class="benefit-card">
          <div class="benefit-icon">✓</div>
          <h3>Gestión organizada</h3>
          <p>
            Mantén tus solicitudes centralizadas y consulta
            su historial cuando lo necesites.
          </p>
        </article>

      </div>
    </section>

    <!-- FUNCIONAMIENTO -->
    <section id="funcionamiento" class="landing-process">

      <div class="section-heading">
        <span class="section-eyebrow">ASÍ DE FÁCIL</span>
        <h2>¿Cómo funciona?</h2>
        <p>
          Tres pasos para gestionar tus solicitudes de soporte.
        </p>
      </div>

      <div class="process-grid">

        <article class="process-item">
          <span class="process-number">01</span>
          <h3>Crea tu cuenta</h3>
          <p>Accede a la plataforma con tu cuenta institucional.</p>
        </article>

        <article class="process-item">
          <span class="process-number">02</span>
          <h3>Registra tu incidencia</h3>
          <p>Describe el problema y selecciona su categoría y prioridad.</p>
        </article>

        <article class="process-item">
          <span class="process-number">03</span>
          <h3>Consulta el progreso</h3>
          <p>Revisa el estado y los comentarios de tu solicitud.</p>
        </article>

      </div>
    </section>

    <!-- CTA FINAL -->
    <section class="landing-cta">
      <div>
        <span class="section-eyebrow">ETICKET · UTH</span>
        <h2>El soporte comienza aquí.</h2>
        <p>
          Centraliza tus solicitudes y mantente al tanto de cada incidencia.
        </p>
      </div>

      <RouterLink to="/registro" class="cta-button">
        Comenzar ahora →
      </RouterLink>
    </section>

    <!-- FOOTER -->
    <footer class="landing-footer">
      <RouterLink to="/" class="footer-brand">
        ETicket
      </RouterLink>

      <p>
        Sistema Web de Gestión de Incidencias de Soporte Técnico UTH.
      </p>

      <span>© 2026 ETicket · UTH</span>
    </footer>

  </main>
</template>
