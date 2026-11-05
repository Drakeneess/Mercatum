# Arquitectura de Mercatum — Prototipo 0.1

## Objetivo

Demostrar el circuito completo entre interfaz SVG, mensajes WebSocket y simulación autoritativa de posiciones, sin introducir lógica de combate ni una base de datos prematuramente.

## Flujo de movimiento

1. El navegador representa un mapa compartido con coordenadas axiales `(q, r)`.
2. El explorador selecciona un hexágono contiguo.
3. El cliente envía `{"type":"move","to":{"q":1,"r":0}}`.
4. El servidor verifica tipo de datos, adyacencia, transitabilidad y tiempo desde el último movimiento.
5. Si el movimiento es válido, el servidor actualiza la sesión en memoria y envía `player_moved` a todos los clientes.
6. Si es inválido, responde únicamente al remitente con `move_rejected`.

Las posiciones que muestra el cliente llegan del servidor. El cliente no cambia su posición de forma optimista.

## Mapa

El mapa inicial tiene radio 4, para un total de 61 hexágonos. Todos los hexágonos están en `packages/shared/src/world.ts`. Los vecinos y distancias se calculan en `packages/shared/src/hex.ts`. Las entradas, paredes y el primer puesto comercial son posiciones fijas para facilitar las pruebas.

## Tiempo

El servidor envía la hora del Mercado en UTC−6 fijo usando `Etc/GMT+6`. El cliente no usa la hora de su sistema como autoridad. En esta fase el tiempo solo se muestra en la interfaz.

## Restricciones de esta fase

- Las conexiones no están autenticadas. Cada conexión crea un operador temporal.
- Reiniciar el servidor borra todos los exploradores conectados.
- Reabrir la página crea otro personaje temporal; aún no hay reglas de desconexión.
- El máximo de usuarios es 20 sesiones WebSocket, no una cola de admisión.
- No existe IA de criaturas ni simulación de sectores vacíos.
- La economía y el historial de objetos aún no se almacenan.
- El servidor valida movimientos; no debe considerarse preparado para internet abierto sin autenticación, cuotas y protección operativa adicional.

## Siguientes hitos

1. Pruebas de sincronización y reconexión bajo latencia real.
2. Modelo de estados/eventos para entidades autónomas, con tiempo de próxima acción.
3. Persistencia selectiva con PostgreSQL.
4. Definición de reglas de desconexión antes de activar permadeath.
5. Comercio e inventarios registrados.

Regla de diseño: **los jugadores son temporales; el Mercado permanece**.
