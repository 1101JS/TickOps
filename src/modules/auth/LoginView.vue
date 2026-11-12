
<script setup>
import './LoginView.css'

const HandleLogin = () => {
  console.log('Login solicitado')
}
</script>

<template>
  <main class="login-page">
    <section class="login-card">
      <div class="login-brand">
        <div class="login-logo">E</div>
        <h1>ETicket</h1>
        <p>Sistema de Gestión de Incidencias</p>
      </div>

      <div class="login-heading">
        <h2>Bienvenido</h2>
        <p>Ingresa tus credenciales para continuar.</p>
      </div>

      <form class="login-form" @submit.prevent="HandleLogin">
        <div class="form-group">
          <label for="email">Correo electrónico</label>
          <input
            id="email"
            type="email"
            placeholder="usuario@uth.hn"
            autocomplete="username"
            required
          />
        </div>

        <div class="form-group">
          <label for="password">Contraseña</label>
          <input
            id="password"
            type="password"
            placeholder="Ingresa tu contraseña"
            autocomplete="current-password"
            required
          />
        </div>

        <button type="submit" class="login-button">
          Iniciar sesión
        </button>
      </form>

      <footer class="login-footer">
        <p>UTH · Sistema de Soporte Técnico</p>
      </footer>
    </section>
  </main>
</template>
