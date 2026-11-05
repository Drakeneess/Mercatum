# Arquitectura de Mercatum — Prototipo 0.2 (Colyseus)

## Objetivo

La interfaz SVG y las reglas hexagonales se mantienen, mientras que la capa WebSocket propia se reemplaza por Colyseus 0.18. El servidor sigue siendo la única autoridad sobre posiciones y movimientos.

## Mundo compartido

- `apps/server/src/index.ts` configura Colyseus y crea una única sala `mercatum` con ID fijo `mercatum-world` al inicio.
- El matchmaking expone únicamente `join` y `reconnect`. No se permite que el navegador cree instancias con `create` o `joinOrCreate`.
- `apps/server/src/MercatumRoom.ts` tiene `maxClients = 20`, `autoDispose = false`, `patchRate = 200` y `maxMessagesPerSecond = 30`.
- El cliente Next.js llama a `join("mercatum")` para entrar en la única sala existente (sin crear otras) y aplica espera progresiva si no está disponible.

## Estado sincronizado

`packages/shared/src/schema.ts` define `MercatumState` y `MercatumPlayer` mediante el builder de `@colyseus/schema` 5. Solo los datos visibles globalmente se incluyen en este estado:

- `players`: mapa sincronizado de exploradores con `name`, `q`, `r`.
- `mercatumTime`: hora oficial `HH:mm` según UTC−6.

No se publican posiciones de criaturas ocultas. Cuando existan, será obligatorio añadir filtrado por cliente (por ejemplo, StateView) o mensajes privados de percepción.

## Flujo de movimiento

1. El navegador muestra el mapa con coordenadas axiales `(q, r)`.
2. El explorador selecciona un hexágono contiguo.
3. Envía `room.send("move", {to:{q:1,r:0}})`.
4. `MercatumRoom` valida el tipo, la adyacencia, la transitabilidad y un intervalo mínimo de 250 ms.
5. Si es válido, actualiza `player.q` y `player.r` en el Schema y envía `move_accepted` solo al solicitante.
6. Colyseus entrega automáticamente el parche de estado al resto de exploradores.
7. Si se rechaza, recibe `move_rejected` con el motivo. El cliente jamás actualiza la posición de forma optimista.

El mapa sigue siendo estático en `packages/shared/src/world.ts`. No requiere sincronizar los 61 hexágonos en cada movimiento.

## Tiempo y coste

El servidor usa el reloj fijo `Etc/GMT+6`, independientemente del horario del navegador. Un temporizador de sala verifica la hora cada diez segundos y solo muta el estado si cambia el minuto mostrado.

**No se añadió bucle de simulación de 60 FPS.** La entrega de parches cada 200 ms es una cadencia de red que puede evitar transmisiones cuando no cambia nada. Los futuros comportamientos de criaturas deberán utilizar un planificador de eventos con marcas de tiempo absolutas.

## Pruebas

`pnpm --filter @mercatum/server smoke` inicia el servidor compilado y comprueba dos clientes, replicación de una posición, rechazo de salto inválido, bloqueo de creación de salas alternativas y supervivencia de la sala cuando no quedan jugadores. GitHub Actions ejecuta compilación, typecheck, pruebas unitarias y esta prueba de integración.

## Restricciones

- Aún no hay autenticación: cada nueva conexión es un personaje efímero.
- La reconexión automática del frontend vuelve a entrar con **nueva identidad**. No es la reconexión segura de Colyseus que hará falta para permadeath.
- El estado de la sala sigue en memoria; reiniciar el proceso lo borra.
- `autoDispose = false` no sustituye a PostgreSQL.
- El límite de 20 clientes no constituye un sistema de colas.
- No hay enemigos, economía ni simulación de sectores vacíos.
- Se requiere autenticación, validación de orígenes, control de abuso y configuración de hosting antes de producción.

## Siguientes hitos

1. Integrar reconexión por sesión con un protocolo seguro para personajes.
2. Introducir planificador de eventos para criaturas (independiente de los ticks de red).
3. Incorporar persistencia selectiva en PostgreSQL y recuperación tras reinicios.
4. Implementar visibilidad limitada y percepción individual.
5. Añadir inventario, comercio y registro de objetos.

**Los jugadores son temporales; el Mercado permanece.**

## Diagnóstico del mundo

`/health` consulta el estado real del matchmaking y muestra `worldReady`, `roomName`, `roomId`, `activeRoomIds` y número de jugadores. Al iniciar, el servidor también comprueba que la sala precreada tenga el ID esperado. Esto distingue un servidor HTTP disponible de un mundo realmente inicializado.
