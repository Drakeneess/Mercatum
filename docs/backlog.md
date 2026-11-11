# Mercatum — Product Backlog

> **Estado:** propuesta inicial de planificación, no son funcionalidades implementadas ni fechas comprometidas. **Actualizado:** 10 de noviembre de 2026.

## Norte del producto

Mercatum es un mercado paranormal persistente, con mapa hexagonal 2D y desplazamiento discreto en **tiempo real**. El mundo evoluciona incluso sin jugadores. Las personas entran, exploran, comercian, dejan rastros, pueden ser engañadas y corren el riesgo de perderlo todo. Una build determina **alternativas y costes** de acciones, nunca omnisciencia ni invulnerabilidad. La interfaz conserva el horror documental crudo de los tres soportes actuales.

### Lo que existe y está probado (no reabrir como tareas pendientes)

- [x] Next.js (puerto local 3500), Colyseus 0.18 (puerto local 3001), un mundo canónico con aforo de 20 conexiones.
- [x] Mapa de demostración de 61 hexágonos, obstáculos y movimientos autoritativos de casilla adyacente.
- [x] Siete atributos (FUE, DES, RES, PER, INT, TRA, TEM), build inicial validada por servidor; **solo DES tiene una regla activa**.
- [x] Cooldown de movimiento discreto según DES, reloj de referencia UTC−06:00, eventos de estado compartido.
- [x] Reconexión básica que hoy **crea identidad nueva** (todavía no es reconexión segura).
- [x] Tres soportes visuales: Libro de incidencias, Cinta de vigilancia y Turno de cierre.
- [x] Código dividido en componentes, hooks, servicios de dominio y estilos; CI con build, typecheck, tests y smoke.

### No existe todavía

Cuentas, persistencia PostgreSQL, inventarios, instancias únicas durables, comerciantes, dinero, criaturas autónomas, daño, permadeath, chat de proximidad, registro público de objetos y reputación. La sala sobrevive vacía, pero **el estado del proceso no sobrevive a reiniciar el servidor**.

## Etapas de entrega (vertical slices)

| Hito | Demostración verificable | Dependencias principales |
| --- | --- | --- |
| **V0 · Base técnica** | Entrar con build y moverse; multijugador básico | **Ya existe** |
| **V1 · Incursión con botín** | Un jugador entra, abre algo, obtiene un objeto único, sale y recupera ese objeto después de reiniciar el servicio | F-001–008; X-009–014, X-017 |
| **V2 · Riesgo real** | Una criatura autónoma patrulla, persigue, hiere o mata; una muerte es definitiva y una desconexión no es una salida gratis | X-018; H-019–025 |
| **V3 · Mercado de jugadores** | Se compra, vende, intercambia, desgasta y documenta un objeto sin duplicación, con afirmaciones públicas atribuidas | E-029–038 |
| **V4 · Alfa privada** | Chat de cercanía, límites de abuso, una ruta de incursión repetible y pruebas de carga/observabilidad | S-041–047 |
| **V5 · Profundidad** | Pisos extra, habilidades y ecología más rica | Z-048–052 |

**Importante:** V1, V2 y V3 son cortes demostrables y pueden construirse gradualmente. No se debe implementar toda la economía ni todas las criaturas antes de probar un recorrido de extremo a extremo.

## Convenciones de la cola

- **P0:** bloqueador del siguiente corte funcional; **P1:** profundidad necesaria para una alfa; **P2:** crecimiento o decisión posalfa.
- **S / M / L:** esfuerzo relativo (pequeño / medio / grande); **no** son puntos de historia calibrados ni promesas de plazo.
- Todo ticket está **pendiente** salvo la base V0 marcada como existente arriba. Dependencias usan IDs (F-001, X-012, etc.); un rango corto indica el conjunto de tickets indicado.
- **Aceptación** es la condición mínima para cerrar una historia. Dividir una historia grande en tareas de PR es válido, pero preservar el ID de trazabilidad.

## F · Fundamentos de persistencia e identidad

No perder el mundo ni crear personajes nuevos involuntariamente al recargar; garantizar autoridad del servidor.

| ID | Prioridad | Tamaño | Depende | Trabajo y criterio de aceptación |
| --- | --- | --- | --- | --- |
| F-001 | P0 | S | — | **Definir contrato de sesión, extracción, desconexión y muerte** — Documento de decisiones: cuándo se guarda, qué queda en el Mercado y cómo se trata una salida no voluntaria. |
| F-002 | P0 | L | 001 | **Esquema PostgreSQL y migraciones versionadas** — Tablas para cuentas, personajes, mundo, instancias de objetos, movimientos económicos y registros; migraciones reproducibles. |
| F-003 | P0 | M | 002 | **Identidad de cuenta separada de personaje** — Una identidad estable puede tener personajes efímeros; el servidor rechaza identidad y sesión falsificadas. |
| F-004 | P0 | M | 002,003 | **Crear y cargar personajes persistentes** — Los siete atributos se guardan y se validan al volver a ingresar; reiniciar Colyseus no duplica personajes. |
| F-005 | P0 | L | 003,004 | **Reconexión segura e idempotente** — Recargar o perder Wi-Fi no crea otro personaje ni evade el estado o el cooldown; las sesiones paralelas están controladas. |
| F-006 | P0 | M | 002 | **Transacciones y eventos durables** — Cambios de inventario, propiedad y muerte usan operaciones atómicas y un registro de eventos auditable. |
| F-007 | P0 | M | 003 | **Endurecer admisión y mensajes** — Validación de origen, rate limiting, tamaño de payload, permisos por usuario y errores controlados. |
| F-008 | P0 | M | 002–007 | **Pruebas de persistencia y recuperación** — CI verifica migraciones, reingreso, desconexión y operaciones concurrentes; recuperación tras reinicio documentada. |

## X · Exploración con objetos y decisiones

Primer vertical slice: entrar, inspeccionar, obtener algo, transportarlo, salir y conservarlo.

| ID | Prioridad | Tamaño | Depende | Trabajo y criterio de aceptación |
| --- | --- | --- | --- | --- |
| X-009 | P0 | M | 001 | **Modelo de sectores y mapa basado en datos** — La sala consulta un mapa con sectores, casillas, obstáculos, entrada y salida; se reemplaza el hardcode sin romper el hexágono. |
| X-010 | P0 | M | Acciones temporizadas e interrumpibles | **Inspeccionar, abrir y recoger duran tiempo de servidor; se puede interrumpir sin duplicar resultados y sin detener el mundo.** — undefined |
| X-011 | P0 | M | Puertas con rutas de solución por build | **Una puerta admite Fuerza, Intelecto o herramientas; cada solución cambia tiempo, ruido o desgaste; sin requisito binario universal.** — undefined |
| X-012 | P0 | M | Instancias únicas de objetos en el suelo | **Cada objeto tiene ID estable, ubicación y dueño opcional; dos exploradores no pueden recoger el mismo objeto.** — undefined |
| X-013 | P0 | M | Inventario autoritativo y restricciones | **Recoger, soltar, equipar o transferir actualiza el servidor; peso/capacidad y colisiones de operaciones se comprueban.** — undefined |
| X-014 | P0 | M | Salida y extracción de botín | **Solo se conserva botín al completar una salida válida; cortar la conexión no equivale a extraer.** — undefined |
| X-015 | P1 | M | Resistencia, carga y fatiga | **RES afecta esfuerzo sostenido y exceso de peso; DES sigue marcando el cooldown base y no se invalida por clientes.** — undefined |
| X-016 | P1 | M | Percepción e indicios observables | **PER revela detalles que podrían percibirse en ese lugar; sin mostrar entidades detrás de obstáculos sin justificación.** — undefined |
| X-017 | P0 | M | UI de interacción sin romper estilo documental | **Croquis, inventario, acciones, advertencias y cancelación funcionan en los tres soportes, móvil y teclado.** — undefined |
| X-018 | P0 | L | 009 | **Visibilidad autorizada por jugador** — El servidor filtra información por posición/observación; no transmite amenazas ocultas al estado público. |

## H · Criaturas, daño y permadeath

El Mercado funciona sin jugadores y la amenaza puede perseguir, herir, robar y causar pérdidas definitivas.

| ID | Prioridad | Tamaño | Depende | Trabajo y criterio de aceptación |
| --- | --- | --- | --- | --- |
| H-019 | P0 | L | 002,009 | **Planificador de entidades por timestamps** — Las criaturas actúan por eventos espaciados, sin loop 60 FPS; comportamiento definido aunque la sala esté vacía. |
| H-020 | P0 | M | 019 | **Primera entidad móvil independiente** — Una criatura patrulla o merodea sin seguir guiones del cliente; su estado se conserva al reiniciar. |
| H-021 | P0 | L | 018,020 | **Detección, ruido y persecución** — La criatura percibe solo información plausible; el servidor calcula búsqueda, persecución y abandono del objetivo. |
| H-022 | P0 | M | 020 | **Salud, heridas y consecuencias de ataques** — Los impactos pueden causar heridas o degradación, no solo muerte instantánea; efectos calculados por el servidor. |
| H-023 | P1 | M | 012,013,022 | **Criaturas que dañan o roban objetos** — Una entidad puede deteriorar o quitar objetos según su conducta, preservando trazabilidad y dueño actual. |
| H-024 | P0 | L | 003–006,022 | **Muerte permanente del personaje** — Muerte registrada una sola vez; personaje retirado; no puede volver a entrar con el mismo ID; botín recibe destino definido. |
| H-025 | P0 | M | 005,024 | **Reglas de desconexión en zona peligrosa** — Cerrar pestaña no es una forma gratuita de escapar; reconexión/ausencia y resolución tras timeout quedan definidas y probadas. |
| H-026 | P1 | M | 021 | **Escapar y ocultarse frente a perseguidores** — Velocidad, obstáculos, ruido y pérdida de contacto permiten huir sin que DES sea invencibilidad. |
| H-027 | P1 | S | 019–026 | **Ecología del horario sin recompensas nocturnas artificiales** — El horario influye en rutinas cuando corresponda, pero no garantiza mejor botín; criaturas no salen del edificio según la regla actual. |
| H-028 | P1 | M | 020,021 | **Dos arquetipos de amenaza y pruebas de balance** — Al menos un merodeador y un perseguidor con comportamientos distinguibles; pruebas de escape para DES 1–3. |

## E · Mercado, intercambio y memoria de objetos

Objetos con historia auténtica, afirmaciones disputables y comercio donde la desinformación sea posible.

| ID | Prioridad | Tamaño | Depende | Trabajo y criterio de aceptación |
| --- | --- | --- | --- | --- |
| E-029 | P0 | M | 002,006 | **Moneda interna, saldos y asientos** — Saldo autoritativo; sin saldo negativo no permitido; cada compra o venta queda trazada sin duplicar dinero. |
| E-030 | P0 | L | 012,013,029 | **Comerciante y compraventa NPC** — Listados, precios y disponibilidad vigentes; compra/venta en transacción única, aun con clientes simultáneos. |
| E-031 | P0 | L | 003,013,029 | **Intercambio directo entre exploradores** — Oferta, aceptación de ambas partes, cancelación y commit atómico; jamás duplica objetos ni saldos. |
| E-032 | P1 | M | 030 | **Trato aplicado a negociación** — TRA modifica alternativas o condiciones sin permitir manipular entidades ajenas a negociar. |
| E-033 | P1 | M | 012,022,030 | **Desgaste, daño, estado y devaluación** — Un mismo objeto puede oxidarse, romperse y cambiar de valor; condición y eventos persisten. |
| E-034 | P0 | L | 006,012,031 | **Historial inmutable de procedencia** — Propiedad, operaciones y eventos verificables se agregan sin reescritura; la UI distingue hechos del servidor. |
| E-035 | P0 | M | 003,034 | **Anotaciones públicas atribuidas** — Los jugadores publican declaraciones sobre un objeto firmadas por identidad/timestamp; nunca se convierten automáticamente en verdad. |
| E-036 | P1 | M | 035 | **Contradicciones, respuestas y evaluación social** — Se pueden agregar testimonios y pruebas contradictorias; no se borra la afirmación original ni se castiga automáticamente al estafador. |
| E-037 | P1 | M | 034,035 | **Consulta al registro fuera del Mercado** — El punto físico de consulta está fuera del edificio; no es una inspección gratis disponible en cualquier hexágono. |
| E-038 | P0 | L | 030,031,034 | **Pruebas anti-duplicación y consistencia** — Compras simultáneas, retries, transferencias y caídas no reproducen objetos ni monedas; conciliación de historial probada. |
| E-039 | P1 | M | 029–038 | **Equilibrio económico básico** — Fuentes, sumideros, comisiones y oferta de mercancía se documentan y pueden ajustarse sin redeploy. |
| E-040 | P2 | S | 034,035 | **ADR: necesidad real de blockchain** — Comparar ledger append-only centralizado vs cadena externa por coste, trazabilidad, confianza y privacidad; no imponer blockchain antes de validar. |

## S · Social, experiencia y alfa privada

Que los encuentros entre jugadores sean significativos y que el juego soporte pruebas reales sin perder control técnico.

| ID | Prioridad | Tamaño | Depende | Trabajo y criterio de aceptación |
| --- | --- | --- | --- | --- |
| S-041 | P0 | M | 003,018 | **Chat de proximidad** — Solo pueden leer mensajes los exploradores en alcance; el servidor valida distancia y no usa chat global. |
| S-042 | P0 | M | 041 | **Moderación mínima y herramientas de usuario** — Mute, bloqueo, reporte y límites de spam; las estafas dentro del juego no justifican acoso fuera del juego. |
| S-043 | P1 | M | 017,041 | **Presentación narrativa y accesibilidad** — Los mensajes, comandos y avisos son legibles con los tres temas; teclado, móvil y alternativas a señales solo cromáticas. |
| S-044 | P1 | M | 014,024,030 | **Onboarding breve y salida comprensible** — Un nuevo explorador puede completar una incursión sin tutorial intrusivo y entiende consecuencias de muerte/extracción. |
| S-045 | P0 | M | 019,041 | **Prueba de carga y presupuesto operativo** — Medir CPU, RAM, red, persistencia y latencia con 20 usuarios; límites y degradación controlada sin tick global caro. |
| S-046 | P0 | M | 002,008 | **Staging, respaldos y observabilidad** — Despliegue reproducible, health, errores, latencias, backups y prueba de restauración; secretos fuera del repo. |
| S-047 | P1 | M | 041–046 | **Alfa cerrada y telemetría de diseño** — Sesiones de prueba con feedback de movimiento, persecución, pérdidas, comercio y fricción; incidencias priorizadas. |

## Z · Expansión posterior a la alfa

Ampliar profundidad sin bloquear el primer juego que se puede terminar.

| ID | Prioridad | Tamaño | Depende | Trabajo y criterio de aceptación |
| --- | --- | --- | --- | --- |
| Z-048 | P2 | L | 009,018,019 | **Múltiples plantas, escaleras y ascensores** — Cambio de piso autoritativo; mapas y entidades independientes; transiciones seguras. |
| Z-049 | P2 | L | 011,015,016,032 | **Habilidades aprendidas y progresión limitada** — Especializaciones, no subida indiscriminada de todos los stats; builds diferenciadas con permadeath. |
| Z-050 | P2 | L | 019–028 | **Ecosistema hostil y eventos de mundo** — Comportamientos, robos, encuentros raros, rutinas y persistencia entre visitas con consumo acotado. |
| Z-051 | P2 | M | 033–039 | **Objetos históricos y expediciones documentadas** — Un objeto degradado conserva historial verificable y notas no verificadas; hallazgos narrativos emergentes. |
| Z-052 | P2 | M | 047 | **Ampliación controlada del mundo y aforo** — Decisión de particionado o servidor por sector respaldada por medidas; sin prometer MMO masivo en una sala de 20. |

## Primera secuencia de implementación recomendada

No empezar por criaturas o blockchain. Ordenar la primera iteración así:

1. **F-001:** reglas explícitas de entrada, extracción, desconexión y pérdida; elimina decisiones ambiguas que luego afectan al esquema.
2. **F-002 + F-003:** migraciones PostgreSQL e identidad estable (cuenta y personaje separados).
3. **F-004 + F-005:** crear personaje persistente y reconexión segura.
4. **F-006 + F-008:** transacciones, registros e integración con base de datos en CI.
5. **X-009 + X-010:** sectores basados en datos y acciones con demora/cancelación.
6. **X-012 + X-013 + X-014:** un objeto único, inventario y extracción; cerrar V1.

**Primera demo objetivo:** dos exploradores ven el mismo botín; solo uno puede recogerlo; el propietario sale; tras recargar y reiniciar el backend, sigue teniendo ese objeto, mientras la otra sesión no pudo duplicarlo. El personaje conserva sus stats y el cooldown de DES.

## Dependencias críticas y riesgos

- **Reconexión antes de permadeath:** el comportamiento actual crea otra identidad al desconectarse; no habilitar pérdidas definitivas antes de F-005 y H-025.
- **Filtrado antes de criaturas ocultas:** X-018 antes de emitir posiciones de entidades; no fiarse de ocultar datos solo con CSS.
- **Transacciones antes de comercio:** F-006 y E-038 antes de mercados reales; la simultaneidad del servidor puede provocar duplicaciones.
- **Registro histórico no implica verdad:** E-034 contiene hechos verificables de servidor; E-035 contiene afirmaciones atribuidas a jugadores. Una afirmación puede ser falsa o discutida; el sistema no la certifica automáticamente.
- **Blockchain no es requisito inicial:** E-040 investiga su coste y necesidad; usar primero historial append-only con identidad, control de acceso y pruebas.
- **Bajo coste:** un scheduler de eventos, no un bucle a 60 FPS para todos los NPC; instrumentar consumo antes de aumentar mapa/aforo.
- **Riesgo comercial no equivale a abuso interpersonal:** permitir estafas como mecánica no elimina herramientas contra acoso, spam o suplantación.
- **Horario y botín:** el reloj es único (UTC−06:00); no forzar recompensas mejores de noche. Hasta ahora no hay reportes oficiales de criaturas fuera del edificio; no inventar excepciones como regla base.

## Definition of Done global

Un ticket funcional se cierra cuando: (1) regla de servidor autoritativa y contrato compartido definidos; (2) interfaz correspondiente usable en los tres temas y móvil cuando aplique; (3) pruebas unitarias y al menos una de integración para operaciones con estado; (4) escenarios de desconexión y mensajes duplicados cubiertos cuando haya inventario, muerte o dinero; (5) sin fugas de datos que deban permanecer ocultos; (6) `pnpm build`, `pnpm typecheck`, `pnpm test` y smoke pasan; (7) la documentación se actualiza sin confundir decisiones pendientes con funciones implementadas.

## Decisiones de producto aún abiertas

No cerrar estos puntos por inferencia: mecanismo concreto de autenticación, destino de objetos en muerte/ausencia, definición de zona segura y reglas de retirada, moneda y fuentes/sumideros, cómo se aprende una habilidad, representación de heridas y tensión, condiciones exactas para alcanzar el registro externo, niveles de detalle del chat audible y si eventualmente habrá combate entre jugadores. Resolverlos en F-001 o en los refinamientos de sus épicas antes de escribir código irreversible.

## Mantenimiento

- Cada nuevo cambio debería mencionar el ID del ticket en la descripción del PR o en el commit.
- No marcar tareas como terminadas por tener UI estática; exigir evidencia en servidor y pruebas.
- Revisar prioridad y dependencias después de cada vertical slice; P2 puede adelantarse solo si desbloquea una necesidad medida.
- Este archivo es el **backlog maestro versionado** hasta que se decida usar GitHub Issues/Projects u otro tablero. No se crearon tickets de Issues de forma masiva.
