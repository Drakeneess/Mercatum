# Navegación y composición — Mercatum (refactorización de V3)

**Objetivo:** eliminar el exceso de paneles simultáneos sin convertir Mercatum en un HUD genérico. La UI conserva los tres soportes documentales deteriorados; **no cambia ninguna regla de juego**.

## Vistas principales

| Pestaña | Prioridad | Contenido |
| --- | --- | --- |
| **Explorar** | Primaria | Croquis hexagonal, movimientos, puerta, mercancía al alcance, mochila y extracción; informes adicionales en desplegables |
| **Personaje** | Secundaria | Comprobante, ficha de siete atributos, hora de referencia y nota de seguridad; registro inicial cuando todavía no hay identidad |
| **Comercio** | Secundaria | Secciones **Comerciante** (comprar/vender al NPC desde el exterior) e **Intercambios** (anunciar, proponer, aceptar, rechazar o cancelar ofertas) |
| **Archivo** | Exterior | Consultar por UUID o pieza conocida; distinguir eventos verificados del servidor y testimonios atribuibles que pueden ser falsos |

El menú superior siempre conserva estas cuatro rutas; las tres primeras se encuentran disponibles en cuanto el usuario registra su ficha, y **Archivo** puede abrirse incluso dentro del edificio para explicar que el registro solamente se consulta después de extraer. El cliente no altera esta restricción del servidor.

Antes del primer ingreso solo se habilita **Personaje**, con el registro de atributos. Después de firmar se muestra **Explorar**. Un personaje muerto conserva acceso a su registro; la acción para registrar sucesor sigue en **Explorar**.

## Exploración sin saturación

La pantalla de juego prioriza el mapa como superficie de trabajo. El panel lateral no muestra los sistemas de la economía o el archivo. En su lugar:

- Acciones solo para la **puerta de mantenimiento cercana** cuando todavía está cerrada.
- Lista de **objetos a distancia de recogida**, en vez de un catálogo completo de objetos del mundo.
- Mochila en un desplegable con conteo; dentro se puede abandonar cada objeto.
- Botón de extracción en la entrada y, fuera del edificio, opción de regresar y desplegable de depósito exterior.
- Informe médico/avistamientos e incidencias recientes en dos desplegables cerrados por defecto.

Una franja de estado persistente, visible **en todas las vistas después del registro**, muestra salud, localización, créditos, hora y estado del personaje. Si aparece una criatura, la advertencia puede pulsarse para volver directamente al mapa. **Cambiar de pestaña no pausa al personaje, los ataques, el reloj ni las transacciones de Colyseus.**

## Comercio paso a paso

1. **NPC:** extraer, abrir **Comercio → Comerciante**, comprar un objeto del stock finito o vender uno del depósito exterior.
2. **P2P:** con ambos exploradores conectados fuera o a máximo un hexágono dentro, abrir **Comercio → Intercambios**.
3. El dueño pulsa **Anunciar objeto**; el otro encuentra el anuncio y pulsa **Hacer oferta**.
4. Introduce créditos y, opcionalmente, un objeto propio; **Enviar propuesta** no transfiere nada.
5. El propietario ve la propuesta en **Ofertas pendientes**, y acepta o rechaza. El comprador puede cancelarla.
6. La operación final la valida y confirma el servidor en una sola transacción SQL.

Dentro del edificio, Comercio abre directamente **Intercambios**; el NPC informa que solo opera desde fuera. El saldo sigue siendo propiedad de la cuenta y no del navegador.

## Archivo público

Se presenta como una vista distinta; no aparece debajo de otros 20 paneles de incursión. Muestra hechos del servidor y testimonios en estilos separados, con el autor y fecha. No concede acceso gratuito al archivo desde dentro ni convierte declaraciones de los jugadores en hechos verificados.

## Organización técnica

- `app/page.tsx`: composición y destino seleccionado; la navegación **no desmonta `useMercatumRoom`**.
- `components/WorkspaceNavigation.tsx`: rutas accesibles y contador de ofertas entrantes.
- `components/ExpeditionStatus.tsx`: franja persistente de estado/amenazas.
- `components/SectorNotes.tsx`: solo acciones situacionales y registros secundarios de la incursión.
- `components/MarketBoard.tsx`: marco y selección entre comercio NPC e intercambios.
- `components/MerchantPanel.tsx`: stock NPC y objetos depositados para venta.
- `components/ExchangePanel.tsx`: anuncios, ofertas, formulario y decisiones.
- `components/ProvenanceBoard.tsx`: archivo exterior.
- `app/styles/workspace.css`: composición y adaptación responsive; los colores continúan siendo los de los tres temas.

No se añadieron endpoints ni mutaciones de esquema. La comunicación de Colyseus y los contratos del servidor siguen siendo la autoridad.

## Verificación y límites

Ejecutar `pnpm build`, `pnpm typecheck`, `pnpm test` y los smoke tests existentes. Las pruebas V1/V2/V3 confirman que reorganizar la UI no alteró la persistencia, muerte ni comercio.

**QA manual recomendado** (no sustituido por la compilación):

- Tamaños 375 px, 768 px y 1440 px; verificar que el mapa no tenga desplazamiento horizontal y que la navegación se lea.
- Probar los tres soportes: **Libro de incidencias**, **Cinta de vigilancia**, **Turno de cierre**.
- Crear un personaje, pasar al mapa, volver a Personaje sin desconectarse.
- Ver la salud y la alarma de criaturas al entrar a Comercio; volver al mapa desde el aviso.
- Comprar al NPC tras extraer, anunciar y ofrecer desde un segundo navegador.
- Consultar el Archivo fuera; confirmar que dentro solo aparece la explicación.
- Probar navegación por teclado y la presentación de ofertas pendientes.

Esta modificación mejora la **organización visual**; no es una sustitución de la futura revisión UX con jugadores reales.
