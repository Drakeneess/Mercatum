# Navegación y composición — Mercatum (refactorización de V3)

**Objetivo:** eliminar el exceso de paneles simultáneos sin convertir Mercatum en un HUD genérico. La UI conserva los tres soportes documentales deteriorados; **no cambia ninguna regla de juego**. Tras la reorganización inicial, se adoptó un patrón de **mapa permanente + expedientes modales**.

## Superficie principal y expedientes modales

| Pestaña | Prioridad | Contenido |
| --- | --- | --- |
| **Explorar** | Primaria | Croquis hexagonal, movimientos, puerta, mercancía al alcance, mochila y extracción; informes adicionales en desplegables |
| **Personaje** | Secundaria | Comprobante, ficha de siete atributos, hora de referencia y nota de seguridad; registro inicial cuando todavía no hay identidad |
| **Comercio** | Secundaria | Secciones **Comerciante** (comprar/vender al NPC desde el exterior) e **Intercambios** (anunciar, proponer, aceptar, rechazar o cancelar ofertas) |
| **Archivo** | Exterior | Consultar por UUID o pieza conocida; distinguir eventos verificados del servidor y testimonios atribuibles que pueden ser falsos |

El menú superior conserva cuatro accesos: **Explorar** vuelve al mapa y los otros tres abren un **modal sobre la exploración**. Solo puede haber un modal abierto. El plano, la hoja de acciones, la franja de estado y la conexión de Colyseus permanecen montados durante toda la consulta. **Archivo** puede abrirse desde dentro para explicar que el registro solo se consulta después de extraer. El cliente no altera esta restricción del servidor.

Antes del primer ingreso solo se habilita **Personaje**, en un formulario de registro de página completa para no ocultar un mapa todavía inexistente. Después de firmar se muestra **Explorar**, con los expedientes secundarios en modal. Un personaje muerto conserva su registro; si fallece mientras hay un modal abierto, este se cierra para mostrar la defunción y la acción de registrar sucesor.

## Exploración sin saturación

La pantalla de juego prioriza el mapa como superficie de trabajo. El panel lateral no muestra los sistemas de la economía o el archivo. En su lugar:

- Acciones solo para la **puerta de mantenimiento cercana** cuando todavía está cerrada.
- Lista de **objetos a distancia de recogida**, en vez de un catálogo completo de objetos del mundo.
- Mochila en un desplegable con conteo; dentro se puede abandonar cada objeto.
- Botón de extracción en la entrada y, fuera del edificio, opción de regresar y desplegable de depósito exterior.
- Informe médico/avistamientos e incidencias recientes en dos desplegables cerrados por defecto.

Una franja de estado persistente sobre el mapa muestra salud, localización, créditos, hora y estado del personaje. Como el modal impide interactuar con el fondo, su encabezado **duplica la salud y la alerta de criaturas en vivo**. Se puede cerrar con **Escape**, el botón Cerrar o clic en el fondo; el foco retorna al botón que lo abrió. **Abrir un modal no pausa al personaje, los ataques, el reloj ni las transacciones de Colyseus**.

## Comercio paso a paso

1. **NPC:** extraer, abrir **Comercio → Comerciante**, comprar un objeto del stock finito o vender uno del depósito exterior.
2. **P2P:** con ambos exploradores conectados fuera o a máximo un hexágono dentro, abrir **Comercio → Intercambios**.
3. El dueño pulsa **Anunciar objeto**; el otro encuentra el anuncio y pulsa **Hacer oferta**.
4. Introduce créditos y, opcionalmente, un objeto propio; **Enviar propuesta** no transfiere nada.
5. El propietario ve la propuesta en **Ofertas pendientes**, y acepta o rechaza. El comprador puede cancelarla.
6. La operación final la valida y confirma el servidor en una sola transacción SQL.

Dentro del edificio, Comercio abre directamente **Intercambios**; el NPC informa que solo opera desde fuera. El saldo sigue siendo propiedad de la cuenta y no del navegador.

## Archivo público

Se presenta como un modal independiente; no aparece debajo de otros 20 paneles de incursión. Muestra hechos del servidor y testimonios en estilos separados, con el autor y fecha. No concede acceso gratuito al archivo desde dentro ni convierte declaraciones de los jugadores en hechos verificados.

## Organización técnica

- `app/page.tsx`: mapa permanente y modal seleccionado; la navegación **no desmonta `useMercatumRoom` ni `MarketMap`**.
- `components/WorkspaceNavigation.tsx`: botones de acceso a expedientes modales y contador de ofertas entrantes.
- `components/WorkspaceModal.tsx`: `<dialog>` nativo, foco atrapado, tecla Escape, restauración del foco, clic fuera y encabezado con riesgo en vivo.
- `components/ExpeditionStatus.tsx`: franja de estado/amenazas sobre el mapa.
- `components/SectorNotes.tsx`: solo acciones situacionales y registros secundarios de la incursión.
- `components/MarketBoard.tsx`: marco y selección entre comercio NPC e intercambios.
- `components/MerchantPanel.tsx`: stock NPC y objetos depositados para venta.
- `components/ExchangePanel.tsx`: anuncios, ofertas, formulario y decisiones.
- `components/ProvenanceBoard.tsx`: archivo exterior.
- `app/styles/workspace.css`: composición y adaptación responsive; `app/styles/modals.css`: ventanas centradas en escritorio y hojas inferiores en móvil. Los colores siguen los tres temas.

No se añadieron endpoints ni mutaciones de esquema. La comunicación de Colyseus y los contratos del servidor siguen siendo la autoridad.

## Verificación y límites

Ejecutar `pnpm build`, `pnpm typecheck`, `pnpm test` y los smoke tests existentes. Las pruebas V1/V2/V3 confirman que reorganizar la UI no alteró la persistencia, muerte ni comercio.

**QA manual recomendado** (no sustituido por la compilación):

- Tamaños 375 px, 768 px y 1440 px; verificar que el mapa no tenga desplazamiento horizontal y que la navegación se lea.
- Probar los tres soportes: **Libro de incidencias**, **Cinta de vigilancia**, **Turno de cierre**.
- Crear un personaje, abrir/cerrar Personaje, Comercio y Archivo sin desconectarse ni desmontar el mapa; comprobar Escape, foco, clic en el fondo y scroll en cada modal.
- Ver la salud y alarma de criaturas dentro de Comercio; comprobar que el mundo sigue avanzando y que la muerte cierra el modal.
- Comprar al NPC tras extraer, anunciar y ofrecer desde un segundo navegador.
- Consultar el Archivo fuera; confirmar que dentro solo aparece la explicación.
- Probar navegación por teclado y la presentación de ofertas pendientes.

Esta modificación mejora la **organización visual**; no es una sustitución de la futura revisión UX con jugadores reales. No se usa modal para cada paso de exploración: mover, inspeccionar, recoger o extraer deben seguir siendo acciones inmediatas y situacionales. Evitar una pila de modales anidados es una regla deliberada.
