# Mercatum

**Mercatum** es un prototipo web de exploración en un mercado paranormal persistente. El Mercado no es una mazmorra: existe y funciona independientemente de los jugadores.

El prototipo incluye 61 hexágonos, movimiento entre vecinos, sincronización autoritativa de estado con **Colyseus 0.18** y una sola sala para todos los exploradores.

## Estructura

```text
Mercatum/
├── apps/
│   ├── web/             Next.js + React + SVG + @colyseus/sdk
│   └── server/          Node.js + Colyseus (MercatumRoom)
├── packages/
│   └── shared/          Mapa, reglas hexagonales y Schema 5
├── docs/                Documentación técnica
├── pnpm-workspace.yaml
└── package.json
```

## Requisitos

- Node.js 22 o superior
- pnpm 10 (recomendado: 10.34.9)
- Navegador moderno

## Ejecutar localmente

```bash
git clone https://github.com/Drakeneess/Mercatum.git
cd Mercatum

corepack enable
corepack prepare pnpm@10.34.9 --activate
pnpm install
pnpm dev
```

Abre **http://localhost:3500**. Colyseus escucha en **http://localhost:3001** y expone **http://localhost:3001/health**.

Abre dos pestañas para comprobar la sincronización de los exploradores. Selecciona una casilla vecina resaltada para moverte. Las casillas bloqueadas y los saltos entre hexágonos no adyacentes se rechazan en el servidor.

### Configuración opcional

Los valores por defecto funcionan sin `.env`. Puedes copiar `apps/web/.env.example` a `apps/web/.env.local` para configurar `NEXT_PUBLIC_COLYSEUS_URL`. Para cambiar el puerto del backend, copia `apps/server/.env.example` a `apps/server/.env` y establece `PORT`.

Colyseus gestiona el matchmaking HTTP y el transporte WebSocket en el mismo puerto. Si publicas la web por HTTPS, el backend deberá ser accesible mediante HTTPS/WSS y un proxy inverso adecuado. **No despliegues el prototipo públicamente sin autenticación y límites de abuso.**

## Comandos

```bash
pnpm dev         # Compila shared e inicia web + server
pnpm build       # Compila todos los paquetes
pnpm typecheck   # Verifica TypeScript
pnpm test        # Ejecuta pruebas unitarias hexagonales
pnpm --filter @mercatum/server smoke  # Prueba dos clientes reales (requiere build)
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

## Una sala canónica

El servidor crea `MercatumRoom` al iniciar, con ID generado por Colyseus. El cliente utiliza `join("mercatum")`: se une a una sala existente sin crear otras. El backend deshabilita `create` y `joinOrCreate`. El aforo de la única sala está limitado a 20 jugadores y `autoDispose = false` permite mantenerla incluso vacía.

Las posiciones se sincronizan mediante `@colyseus/schema` 5; los comandos de movimiento y sus respuestas usan mensajes de Colyseus. `patchRate = 200` representa una frecuencia máxima de envío de parches, **no** un ciclo de simulación del mundo de 5 FPS.

## Alcance actual

**Implementado**
- Mapa hexagonal de 61 casillas y obstáculos fijos.
- Movimiento validado en servidor (adyacencia, obstáculos y cadencia mínima de 250 ms).
- Sincronización incremental de jugadores, posiciones y reloj fijo UTC−6 mediante Schema.
- Una sala precreada, sin creación de salas desde el cliente, máximo 20 conexiones.
- Intentos de reconexión por nueva sesión desde el frontend y endpoint de salud.
- Pruebas unitarias del mapa y prueba de integración Colyseus con varios clientes.

**Todavía no implementado**
- Inicio de sesión y personajes persistentes.
- Guardado en PostgreSQL.
- Criaturas autónomas, encuentros y persecuciones.
- Comercio, inventarios y objetos únicos.
- Múltiples pisos, elevadores y escaleras.
- Permadeath y reglas de desconexión seguras.

**Importante:** la sala sobrevive a la salida del último jugador, pero **no a un reinicio del servidor**. Los jugadores reconectados reciben una nueva identidad; aún falta reconexión de sesión segura para el permadeath.

Consulta [docs/architecture.md](docs/architecture.md).

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
