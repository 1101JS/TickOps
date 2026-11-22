<script setup>
import { ref, computed } from 'vue';

const busqueda = ref('');
const filtroRol = ref('Todos');
const mensajeVisual = ref('');

const rolesDisponibles = ['Administrador', 'Agente', 'Solicitante'];
const departamentosDisponibles = [
  'Soporte Técnico',
  'Redes e Infraestructura',
  'Operaciones / AIS',
  'Administración',
];

const form = ref({
  nombre: '',
  correo: '',
  password: '',
  rol: 'Solicitante',
  departamento: 'Soporte Técnico',
  activo: true,
});

const usuarios = ref([
  {
    id: 1,
    nombre: 'Kendrick Gerard Melendez Scott',
    correo: 'kmelendez@tickops.local',
    rol: 'Administrador',
    departamento: 'Administración',
    activo: true,
  },
  {
    id: 2,
    nombre: 'David Martinez',
    correo: 'dmartinez@tickops.local',
    rol: 'Agente',
    departamento: 'Soporte Técnico',
    activo: true,
  },
  {
    id: 3,
    nombre: 'Miguel Angel',
    correo: 'mangel@tickops.local',
    rol: 'Agente',
    departamento: 'Redes e Infraestructura',
    activo: true,
  },
  {
    id: 4,
    nombre: 'Marcela Holmes',
    correo: 'mholmes@tickops.local',
    rol: 'Solicitante',
    departamento: 'Operaciones / AIS',
    activo: true,
  },
  {
    id: 5,
    nombre: 'Jerricka Scott',
    correo: 'jscott@tickops.local',
    rol: 'Solicitante',
    departamento: 'Soporte Técnico',
    activo: false,
  },
]);

const usuariosFiltrados = computed(() => {
  return usuarios.value.filter((u) => {
    const coincideRol = filtroRol.value === 'Todos' || u.rol === filtroRol.value;
    const q = busqueda.value.trim().toLowerCase();
    const coincideTexto =
      !q ||
      u.nombre.toLowerCase().includes(q) ||
      u.correo.toLowerCase().includes(q) ||
      (u.departamento && u.departamento.toLowerCase().includes(q));
    return coincideRol && coincideTexto;
  });
});

const totalActivos = computed(() => usuarios.value.filter((u) => u.activo).length);
const totalAgentes = computed(() => usuarios.value.filter((u) => u.rol === 'Agente').length);

const agregarUsuarioVisual = () => {
  if (!form.value.nombre.trim() || !form.value.correo.trim()) return;

  const siguienteId =
    usuarios.value.length > 0 ? Math.max(...usuarios.value.map((u) => u.id)) + 1 : 1;

  usuarios.value.unshift({
    id: siguienteId,
    nombre: form.value.nombre.trim(),
    correo: form.value.correo.trim().toLowerCase(),
    rol: form.value.rol,
    departamento: form.value.rol === 'Solicitante' ? '—' : form.value.departamento,
    activo: form.value.activo,
  });

  mensajeVisual.value = `Vista previa actualizada: se añadió "${form.value.nombre.trim()}".`;
  form.value = {
    nombre: '',
    correo: '',
    password: '',
    rol: 'Solicitante',
    departamento: 'Soporte Técnico',
    activo: true,
  };
};

const alternarEstadoVisual = (usuario) => {
  usuario.activo = !usuario.activo;
  mensajeVisual.value = `Estado visual de ${usuario.nombre}: ${
    usuario.activo ? 'Activo' : 'Inactivo'
  }.`;
};
</script>

<template>
  <div class="users-view">
    <header class="users-header">
      <div>
        <h1 class="users-title">Gestión de Usuarios</h1>
        <p class="users-subtitle">
          Administración de cuentas, roles y departamentos dentro de TickOps
        </p>
      </div>

      <div class="users-kpis">
        <div class="kpi-pill">
          <span class="kpi-num">{{ usuarios.length }}</span>
          <span class="kpi-label">Total</span>
        </div>
        <div class="kpi-pill kpi-success">
          <span class="kpi-num">{{ totalActivos }}</span>
          <span class="kpi-label">Activos</span>
        </div>
        <div class="kpi-pill kpi-info">
          <span class="kpi-num">{{ totalAgentes }}</span>
          <span class="kpi-label">Agentes</span>
        </div>
      </div>
    </header>

    <div v-if="mensajeVisual" class="visual-banner">
      {{ mensajeVisual }}
    </div>

    <section class="panel-card">
      <h2 class="panel-title">Registrar nuevo usuario</h2>

      <form class="user-form-grid" @submit.prevent="agregarUsuarioVisual">
        <div class="field">
          <label for="u-nombre">Nombre completo</label>
          <input
            id="u-nombre"
            v-model="form.nombre"
            type="text"
            placeholder="Ej. Carlos Mendoza"
            required
          />
        </div>

        <div class="field">
          <label for="u-correo">Correo electrónico</label>
          <input
            id="u-correo"
            v-model="form.correo"
            type="email"
            placeholder="cmendoza@tickops.local"
            required
          />
        </div>

        <div class="field">
          <label for="u-password">Contraseña temporal</label>
          <input
            id="u-password"
            v-model="form.password"
            type="password"
            placeholder="••••••••"
            required
          />
        </div>

        <div class="field">
          <label for="u-rol">Rol asignado</label>
          <select id="u-rol" v-model="form.rol">
            <option v-for="r in rolesDisponibles" :key="r" :value="r">
              {{ r }}
            </option>
          </select>
        </div>

        <div class="field">
          <label for="u-depto">Departamento</label>
          <select
            id="u-depto"
            v-model="form.departamento"
            :disabled="form.rol === 'Solicitante'"
          >
            <option v-for="d in departamentosDisponibles" :key="d" :value="d">
              {{ d }}
            </option>
          </select>
        </div>

        <div class="field field-toggle">
          <label class="checkbox-row">
            <input v-model="form.activo" type="checkbox" />
            <span>Cuenta activa al crear</span>
          </label>
        </div>

        <div class="form-submit-row">
          <button type="submit" class="btn-primary-visual">Agregar a la lista</button>
        </div>
      </form>
    </section>

    <section class="panel-card">
      <div class="toolbar-row">
        <h2 class="panel-title">Directorio de usuarios</h2>

        <div class="filters-group">
          <input
            v-model="busqueda"
            type="search"
            class="search-input"
            placeholder="Buscar por nombre, correo o área..."
          />

          <select v-model="filtroRol" class="filter-select">
            <option value="Todos">Todos los roles</option>
            <option v-for="r in rolesDisponibles" :key="r" :value="r">
              {{ r }}
            </option>
          </select>
        </div>
      </div>

      <div class="table-responsive">
        <table class="users-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Usuario</th>
              <th>Rol</th>
              <th>Departamento</th>
              <th>Estado</th>
              <th class="col-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in usuariosFiltrados" :key="u.id">
              <td class="mono">#{{ String(u.id).padStart(3, '0') }}</td>
              <td>
                <div class="user-cell">
                  <span class="user-avatar">{{ u.nombre.charAt(0).toUpperCase() }}</span>
                  <div>
                    <div class="user-name">{{ u.nombre }}</div>
                    <div class="user-email">{{ u.correo }}</div>
                  </div>
                </div>
              </td>
              <td>
                <span :class="['role-badge', `role-${u.rol.toLowerCase()}`]">
                  {{ u.rol }}
                </span>
              </td>
              <td>{{ u.departamento }}</td>
              <td>
                <span :class="['status-dot', u.activo ? 'is-active' : 'is-inactive']">
                  {{ u.activo ? 'Activo' : 'Inactivo' }}
                </span>
              </td>
              <td class="col-right">
                <button
                  type="button"
                  class="btn-action-visual"
                  @click="alternarEstadoVisual(u)"
                >
                  {{ u.activo ? 'Desactivar' : 'Activar' }}
                </button>
              </td>
            </tr>
            <tr v-if="usuariosFiltrados.length === 0">
              <td colspan="6" class="empty-row">
                No hay usuarios que coincidan con el filtro actual.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.users-view {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 1.5rem;
  font-family: var(--font-primary);
  color: var(--color-text);
}

.users-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.users-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--color-text);
}

.users-subtitle {
  margin: 0.25rem 0 0;
  font-size: 0.9rem;
  color: var(--color-text-secondary);
}

.users-kpis {
  display: flex;
  gap: 0.65rem;
}

.kpi-pill {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.5rem 0.9rem;
  border-radius: var(--radius-button);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-card);
}

.kpi-pill.kpi-success {
  border-color: var(--color-success);
}

.kpi-pill.kpi-info {
  border-color: var(--color-primary);
}

.kpi-num {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--color-text);
}

.kpi-label {
  font-size: 0.72rem;
  color: var(--color-text-secondary);
}

.visual-banner {
  padding: 0.75rem 1rem;
  border-radius: var(--radius-button);
  font-size: 0.88rem;
  background: var(--color-primary-soft);
  color: var(--color-text);
  border: 1px solid var(--color-primary);
}

.panel-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  padding: 1.25rem;
}

.panel-title {
  margin: 0 0 1rem;
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--color-text);
}

.user-form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 1rem;
  align-items: end;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.field label {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.field input,
.field select,
.search-input,
.filter-select {
  padding: 0.55rem 0.75rem;
  border-radius: var(--radius-button);
  border: 1px solid var(--color-border);
  background: var(--color-surface-secondary);
  color: var(--color-text);
  font-size: 0.9rem;
}

.field input:focus,
.field select:focus,
.search-input:focus,
.filter-select:focus {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.field input:disabled,
.field select:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-bottom: 0.45rem;
  cursor: pointer;
  color: var(--color-text);
}

.form-submit-row {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
}

.btn-primary-visual {
  padding: 0.6rem 1.15rem;
  border: none;
  border-radius: var(--radius-button);
  background: var(--color-primary);
  color: #ffffff;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.btn-primary-visual:hover {
  background: var(--color-primary-hover);
}

.toolbar-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.toolbar-row .panel-title {
  margin: 0;
}

.filters-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.search-input {
  min-width: 220px;
}

.table-responsive {
  overflow-x: auto;
}

.users-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.users-table th,
.users-table td {
  padding: 0.75rem 0.85rem;
  text-align: left;
  border-bottom: 1px solid var(--color-border);
}

.users-table th {
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-secondary);
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.82rem;
  color: var(--color-text-secondary);
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.user-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 0.85rem;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  flex-shrink: 0;
}

.user-name {
  font-weight: 600;
  color: var(--color-text);
}

.user-email {
  font-size: 0.78rem;
  color: var(--color-text-secondary);
}

.role-badge {
  display: inline-block;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  font-size: 0.76rem;
  font-weight: 600;
  background: var(--color-surface-secondary);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

.role-administrador {
  background: var(--color-primary-soft);
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.role-agente {
  background: var(--color-surface-secondary);
  color: var(--color-primary-hover);
  border-color: var(--color-primary);
}

.role-solicitante {
  background: var(--color-surface-secondary);
  color: var(--color-text-secondary);
}

.status-dot {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.82rem;
  font-weight: 600;
}

.status-dot::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot.is-active {
  color: var(--color-success);
}

.status-dot.is-active::before {
  background: var(--color-success);
}

.status-dot.is-inactive {
  color: var(--color-danger);
}

.status-dot.is-inactive::before {
  background: var(--color-danger);
}

.col-right {
  text-align: right;
}

.btn-action-visual {
  padding: 0.38rem 0.75rem;
  border-radius: var(--radius-button);
  border: 1px solid var(--color-border);
  background: var(--color-surface-secondary);
  color: var(--color-text);
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
}

.btn-action-visual:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.empty-row {
  text-align: center !important;
  padding: 1.5rem !important;
  color: var(--color-text-secondary);
}
</style>