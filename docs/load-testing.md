# S-045 — Prueba de 20 jugadores simultáneos

## Objetivo

Comprobar el límite de una sola sala Colyseus de Mercatum (`maxClients=20`) **sin necesitar 20 pestañas ni alterar las partidas habituales**. Este ensayo automatiza 20 clientes de red independientes contra un servidor de prueba, dentro del mismo equipo.

No equivale a una alfa con 20 personas reales. No mide la renderización de Next.js, latencia de Internet, rendimiento de un navegador móvil, operaciones de compraventa bajo estrés ni varias salas en producción.

## Ejecución en Windows PowerShell

Abre Docker Desktop y una consola nueva. No necesitas ejecutar `pnpm dev`; el propio test levanta un servidor Colyseus temporal en el puerto **31343**.

```powershell
cd D:\Mercatum\Mercatum

git status
git pull --ff-only origin main
pnpm install

docker compose up -d db
docker compose ps

pnpm build
pnpm --filter @mercatum/server load:20
```

Para conservar el resultado como archivo de texto:

```powershell
pnpm --filter @mercatum/server load:20 |
  Tee-Object -FilePath "$env:TEMP\mercatum-load-20.txt"
```

Si PostgreSQL no está accesible, `Test-NetConnection 127.0.0.1 -Port 5432` debe indicar `TcpTestSucceeded : True`. Si ya hay otro proceso escuchando en 31343, ciérralo o cambia `PORT` en `apps/server/src/load-20.ts`.

**Nunca utilices `docker compose down -v`.**

## Cómo trabaja

1. Crea un **esquema temporal** `load_20_...` en PostgreSQL y lanza un proceso de servidor nuevo con su propio estado, migraciones y 2 criaturas.
2. Crea **20 personajes y cuentas distintos**, en cuatro oleadas de cinco. Todos entran a la **misma sala canónica**, no a 20 salas independientes. El test confirma que cada cliente observa 20 jugadores sincronizados.
3. Consulta el estado `/health` y exige exactamente 20 participantes conectados. Comprueba que un **21.º jugador sea rechazado** sin abrir un mundo extra. Es normal que `worldJoinable` sea falso con la sala llena.
4. Los 20 jugadores realizan **6 movimientos válidos** entre hexágonos de acceso seguros: 120 solicitudes, con espera del cooldown oficial de movimiento.
5. Los 20 envían **un mensaje local cada uno**, todos dentro del radio acústico: se esperan 400 entregas, contando el eco propio de cada emisor. Se solicita también el mapa de criaturas para cada cliente.
6. Mantiene las conexiones activas durante varios segundos y vuelve a verificar el aforo.
7. Finaliza las conexiones, detiene el servidor y **elimina exclusivamente el esquema temporal**. No toca las cuentas ni objetos guardados en el esquema de desarrollo.

El simulador no abre una UI. Usa `@colyseus/sdk`, exactamente el protocolo de red del juego.

## Qué métricas devuelve

| Campo | Interpretación |
| --- | --- |
| `peakConcurrentPlayers` | Número de jugadores que coexistieron en la sala |
| `join.p50Ms`, `join.p95Ms` | Mediana y percentil 95 del tiempo de conexión |
| `movement.accepted`, `movement.rejected` | Comandos de desplazamiento aceptados/rechazados |
| `movement.p50Ms`, `movement.p95Ms` | Tiempo de ida y respuesta de movimientos en el host |
| `chat.sent`, `chat.delivered` | Mensajes originales y entregas a clientes |
| `chat.p95TransitMs` | Tiempo de entrega medido desde el timestamp del servidor |
| `chat.approxReceivedPayloadKiB` | **Solo** bytes de JSON de mensajes de chat recibidos; **no son** bytes reales de WebSocket o ancho de banda total |
| `runtime.rssPeakMB` | Pico de RAM residente del proceso Colyseus |
| `runtime.heapPeakMB` | Pico de heap JavaScript |
| `runtime.cpuPeakPercent` | Uso de CPU del proceso; 100 % equivale aproximadamente a un núcleo completo |
| `runtime.eventLoopP95PeakMs` | Mayor p95 observado de retraso del bucle de eventos en intervalos de 1 s |
| `errors` | Cantidad de respuestas de error inesperadas |

Las muestras de CPU/memoria se registran **solo cuando `MERCATUM_LOAD_METRICS=1` en una ejecución no productiva**. La instrumentación escribe en la terminal, sin exponer estadísticas internas mediante un endpoint público.

## Criterios de aceptación del ensayo

- Llegan **20/20** jugadores a la misma sala; el intento 21 se rechaza.
- Los 20 ven a los otros 19 en el estado sincronizado.
- Se aceptan **120/120 movimientos válidos**.
- Se reciben **400/400 mensajes** con las reglas de chat local, sin usar chat global.
- El servidor sigue respondiendo tras la prueba y `errors=0`.
- El resultado final incluye métricas p50/p95, CPU, RAM y retardo del event loop.
- Las mediciones se comparan entre versiones, con el mismo equipo y configuración; **no hay una cifra universal que garantice 20 usuarios reales**.

Si alguna condición falla, `load:20` termina con código de error y muestra los logs recientes.

## Limitaciones antes de una alfa cerrada

Este es **el primer benchmark local del servidor**. Todavía hace falta una prueba desde 20 navegadores/dispositivos reales en una red compartida o por Internet, con enemigos reales, exploración prolongada, operaciones de comercio, extracción, reconexiones y sesiones que duren horas. También se necesita medir tráfico de WebSocket real con herramientas de red, preparar staging, respaldos y recuperación del servicio. Todo esto forma parte de S-045/S-046, no de esta única medición.

No abras una sala pública usando el token provisional en `localStorage`; falta autentificación adecuada y administración de cuentas.
