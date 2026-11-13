# Mercatum

**Mercatum** es un prototipo web de exploración en un mercado paranormal persistente. El Mercado no es una mazmorra: existe y funciona independientemente de los jugadores.

**Mercatum V3** incorpora el ciclo de V1 (exploración, objetos únicos y extracción), las amenazas de V2 (criaturas, heridas y permadeath), y ahora **créditos, comerciante NPC, ofertas de intercambio, desgaste y registro exterior de procedencia**. Colyseus 0.18 conserva autoridad sobre acciones y PostgreSQL sobre posesión y dinero.

## Estructura

```text
Mercatum/
├── apps/
│   ├── web/             Next.js: app/, components/, hooks/, lib/
│   └── server/          Colyseus: MercatumRoom + domain/
├── packages/
│   └── shared/          Mapa, reglas hexagonales y Schema 5
├── docs/                Documentación técnica
├── pnpm-workspace.yaml
└── package.json
```

## Backlog de desarrollo

El plan de desarrollo por vertical slices, historias con IDs, prioridades, dependencias y criterios de aceptación está en [docs/backlog.md](docs/backlog.md). V1, V2 y V3 cuentan con pruebas de integración. El siguiente objetivo será una **alfa privada controlada** con chat de proximidad, moderación básica y pruebas de carga.

## Requisitos

- Node.js 22 o superior
- pnpm 10 (recomendado: 10.34.9)
- PostgreSQL 16+ (recomendado Docker Desktop y Compose)
- Navegador moderno

## Ejecutar localmente

```bash
git clone https://github.com/Drakeneess/Mercatum.git
cd Mercatum

corepack enable
corepack prepare pnpm@10.34.9 --activate
pnpm install
docker compose up -d db
pnpm dev
```

Abre **http://localhost:3500**. Colyseus escucha en **http://localhost:3001** y expone **http://localhost:3001/health**.

La primera vez, distribuye los siete atributos y pulsa **FIRMAR REGISTRO / ENTRAR**. Después el navegador recupera el mismo personaje mediante una credencial local. Explora, abre la puerta usando FUE o INT, recoge la navaja, regresa a la entrada y **extrae** el botín. Colyseus sigue validando movimiento, acciones e inventario.

### Configuración opcional

Los valores por defecto funcionan sin `.env` **si PostgreSQL está activo en localhost:5432** con la configuración de `compose.yaml`. Puedes copiar `apps/web/.env.example` a `apps/web/.env.local` para configurar `NEXT_PUBLIC_COLYSEUS_URL`. Para cambiar el puerto del backend, copia `apps/server/.env.example` a `apps/server/.env` y establece `PORT` y `DATABASE_URL`.

Colyseus gestiona el matchmaking HTTP y el transporte WebSocket en el mismo puerto. Si publicas la web por HTTPS, el backend deberá ser accesible mediante HTTPS/WSS y un proxy inverso adecuado. **No despliegues V3 públicamente:** la credencial local en `localStorage` es apropiada solamente para pruebas privadas. Falta un mecanismo de autenticación de producción y límites de abuso.

## Comandos

```bash
pnpm dev         # Compila shared e inicia web + server
pnpm build       # Compila todos los paquetes
pnpm typecheck   # Verifica TypeScript
pnpm test        # Pruebas unitarias del paquete shared y las reglas del servidor
pnpm --filter @mercatum/server smoke     # Prueba dos clientes reales (requiere build)
pnpm --filter @mercatum/server smoke:v1  # Botín + reinicio PostgreSQL aislado
pnpm --filter @mercatum/server smoke:v2  # Criaturas, muerte offline y sucesión
pnpm --filter @mercatum/server smoke:v3  # Comercio, trueque y registro público
```

## Interfaz y temas visuales

La página de exploración tiene **tres temas completos**, disponibles desde el menú **CAMBIAR SOPORTE** en el encabezado. El tema se actualiza inmediatamente sin reconectar al jugador y se guarda en `localStorage` (`mercatum.ui.theme`) del navegador.

| Tema | Dirección |
| --- | --- |
| **Libro de incidencias** (por defecto) | Fotocopia sucia, sello de acceso, correcciones en tinta roja y papel doblado |
| **Cinta de vigilancia** | Monitor antiguo con señal deteriorada, verdes lavados y scanlines de CCTV |
| **Turno de cierre** | Recibos gastados, fluorescentes moribundos y señalética comercial sucia |

Los temas modifican la interfaz, la textura y la lectura del mapa hexagonal; **no alteran posiciones, estadísticas ni reglas de juego**. Incluyen estilos adaptables a móvil y respetan `prefers-reduced-motion`. No se descargan imágenes de fondo ni fuentes externas.

Consulta [docs/ui-themes.md](docs/ui-themes.md) para la guía de estilos.

## Navegación de la interfaz

La interfaz usa **Explorar** como mapa permanente; **Personaje**, **Comercio** y **Archivo** se abren como modales documentales encima del plano, en vez de sustituir la pantalla de juego. La mochila y los informes secundarios siguen siendo desplegables situacionales.

**Comercio** tiene dos apartados dentro del mismo modal: **Comerciante** (NPC, solo desde el exterior) e **Intercambios** (anuncios y ofertas P2P desde el exterior o a un hexágono de distancia). **Archivo** es otro modal, consultable solo después de extraer. Los modales muestran salud y alertas en vivo, se cierran con Escape o el botón Cerrar y **no pausan** el mundo.

[Guía completa de navegación, comercio y QA](docs/ui-navigation.md).

## Siete atributos y creación de personaje

El **anexo de aptitudes** de la interfaz permite registrar la build antes de conectar con Colyseus. Cada rasgo empieza en 1; se distribuyen 7 puntos extra (14 puntos en total) con máximo 3 en la creación. El formulario comienza equilibrado con 2 en todos los atributos y permite redistribuir, además de elegir las plantillas «Corredor» y «Rastreador». El cliente envía la ficha al entrar y el servidor **valida todos los valores** y la suma para impedir estadísticas arbitrarias.

| Abrev. | Atributo | Sistema al que servirá |
| --- | --- | --- |
| FUE | Fuerza | Cargas, obstáculos, empuje |
| DES | Destreza | **Intervalo de movimiento entre hexágonos, activo ahora** |
| RES | Resistencia | Fatiga, esfuerzo y lesiones |
| PER | Percepción | Rastros e indicios |
| INT | Intelecto | Documentos, mecanismos y artefactos |
| TRA | Trato | Comercio, negociación e información |
| TEM | Temple | Presión, tensión y pánico |

El cooldown de DES sigue la tabla `[1400, 1200, 1050, 900, 800, 700]` ms para valores 0–5. En la creación se permiten 1–3: **1200, 1050 y 900 ms por hexágono**. El servidor impide movimientos prematuros y la interfaz muestra la recuperación del paso. El jugador mueve **un solo hexágono por acción**.

**Alcance actual (V3):** FUE determina carga y fuerza, DES el intervalo de movimiento, RES mitiga daño, PER permite observar criaturas, INT afecta aperturas y TRA modifica precios de comerciante. TEM permanece reservado para sistemas de tensión. Personajes, heridas, inventario, objetos y créditos persisten en PostgreSQL.

Consulta [docs/character-stats.md](docs/character-stats.md) para la especificación.

## Una sala canónica

El servidor crea `MercatumRoom` al iniciar, con ID generado por Colyseus. El cliente utiliza `join("mercatum")`: se une a una sala existente sin crear otras. El backend deshabilita `create` y `joinOrCreate`. El aforo de la única sala está limitado a 20 jugadores y `autoDispose = false` permite mantenerla incluso vacía.

Las posiciones se sincronizan mediante `@colyseus/schema` 5; los comandos de movimiento y sus respuestas usan mensajes de Colyseus. `patchRate = 200` representa una frecuencia máxima de envío de parches, **no** un ciclo de simulación del mundo de 5 FPS.

## Estado actual — V3

**V1:** mapa, personaje, objetos únicos, mochila y extracción persistentes.

**V2:** dos criaturas autónomas, persecución, heridas, robo de mercancía y muerte permanente sin desconexión segura. **Balance posterior a V3:** detección limitada, ataques con recuperación individual y umbral de acceso protegido; los cambios se guardan sin borrar partidas.

**V3:** 100 créditos ficticios por cuenta, mercado NPC finito en el exterior, tasaciones por condición y Trato, publicaciones voluntarias de objetos, ofertas de intercambio con consentimiento, transacciones SQL atómicas, desgaste, historia de procedencia y testimonios atribuidos **no verificados**. Consultar el registro de objeto solo es posible **fuera del Mercado**.

No se utiliza blockchain ni dinero real. Las afirmaciones públicas pueden ser falsas y no existe castigo automático por estafar mediante la narrativa del juego. Falta un sistema formal de reputación, moderación y chat de cercanía.

Documentación: [V1](docs/v1.md), [V2](docs/v2.md), **[V3](docs/v3.md)**, [arquitectura](docs/architecture.md) y [backlog](docs/backlog.md).

## Diagnóstico de errores 521/522

Comprueba **http://localhost:3001/health**. El servidor correcto debe devolver `worldReady: true`, `roomName: "mercatum"`, un `roomId` generado por Colyseus y `activeRoomIds` con exactamente ese ID. Si el endpoint no existe o no indica que la sala está lista, probablemente estés utilizando otro proceso en el puerto 3001 o el arranque de la sala falló.

En PowerShell, identifica primero quién utiliza el puerto:

```powershell
Get-NetTCPConnection -LocalPort 3001 -State Listen | Select-Object LocalAddress, OwningProcess
Get-Process -Id <ID_DEL_PROCESO>
```

Detén ese proceso **solo si corresponde a una instancia anterior del servidor Mercatum**, después ejecuta `pnpm dev` de nuevo. El cliente aplica espera progresiva de hasta 30 segundos entre intentos fallidos en lugar de saturar el matchmaking.

### Diagnóstico de sala bloqueada

La ruta `/health` ahora muestra `worldJoinable`, `roomLocked`, `roomPrivate`, `roomClients` y `roomMaxClients`. Una sala puede existir (`worldReady: true`) y aun así no aceptar nuevas conexiones (`worldJoinable: false`). Los mensajes del cliente muestran el código y texto **originales** de Colyseus (por ejemplo, 521/522), en lugar de ocultarlos tras un mensaje genérico. Si el servidor está lleno, ciérrale pestañas antiguas antes de reiniciarlo. En desarrollo, el ID de la sala puede cambiar después de un reinicio: el cliente siempre usa el nombre `mercatum`.

### Puertos de desarrollo

Por defecto, el frontend Next.js utiliza **3500** (el puerto 3000 queda libre para otros proyectos) y Colyseus utiliza **3001**. Ejecuta `pnpm dev` desde la raíz y abre `http://localhost:3500`.

### Colyseus: primer estado del cliente

El handshake de `client.join("mercatum")` puede resolverse antes de que `room.state.players` esté disponible. El frontend registra `onStateChange` antes de consultar el estado, ignora snapshots incompletos y solo informa «ENLACE ACTIVO» una vez recibida la primera colección de jugadores. Esto evita el fallo `Cannot read properties of undefined (reading 'keys')` que se producía durante la conexión.

Si `/health` todavía muestra `roomId: "mercatum-world"` y omite `worldJoinable`, entonces otro proceso está ejecutando una versión antigua del servidor. Identifica su PID usando `Get-NetTCPConnection -LocalPort 3001 -State Listen` y revisa su ruta con `Get-CimInstance Win32_Process -Filter "ProcessId = <PID>"` antes de detenerlo. Asegúrate de cerrar **solo** la instancia antigua de Mercatum.

### Dirección de horror documental (UI)

El frontend abandonó la distribución de paneles tácticos limpios. La ficha de jugador es un comprobante de entrada, el mapa hexagonal se presenta como croquis deteriorado y la bitácora adopta apariencia de extractos de incidencias. Los tres soportes son variaciones de horror documental, no paletas premium. El cambio solo afecta la presentación: las validaciones, posiciones y comunicación con Colyseus siguen igual.

## Organización interna del código

La página `apps/web/src/app/page.tsx` solo compone los componentes. Las reglas de creación de builds, la conexión a Colyseus y la selección de temas viven en hooks separados, mientras que el SVG, los formularios y los paneles documentales son componentes independientes. El CSS se distribuye por responsabilidad en `apps/web/src/app/styles/` (manteniendo el orden de importación en `layout.tsx`).

En el backend, `MercatumRoom` solo coordina el ciclo de vida de la sala y confirma los resultados de las reglas definidas en `apps/server/src/domain/`. El movimiento se evalúa mediante una función sin efectos secundarios y tiene pruebas unitarias propias. Los contratos, valores y tipos comunes siguen en `packages/shared/`.

Guía para nuevas mecánicas y detalles: [docs/code-organization.md](docs/code-organization.md).
