/**
 * Entrada servidor del plugin klia-badge.
 *
 * Layout de paquete: server + TUI juntos (OpenCode V2 resuelve `index` como
 * entrada servidor y `tui` como entrada TUI del mismo directorio). El badge
 * vive solo en la TUI (tui.tsx); aqui es un no-op defensivo para que el
 * auto-descubrimiento del servidor (~/.config/opencode/plugins/klia-badge/)
 * cargue el directorio sin errores y no intente nada mas.
 */
export default {
  id: 'klia-badge',
  setup() {
    /* El badge es un componente de interfaz: en el servidor no hay UI. */
  },
};
