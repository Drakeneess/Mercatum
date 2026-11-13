# Arquitectura de Mercatum V3 — Riesgo y economía persistentes

## Contexto

Una sola sala Colyseus 0.18 atiende hasta 20 conexiones concurrentes. Next.js 16 muestra el mundo como un plano SVG hexagonal. **El cliente no decide resultados**: Colyseus valida comandos y PostgreSQL conserva el estado durable.

V2 ejecuta criaturas, daño, robo de objetos y muerte permanente. Comercio entre jugadores ya está implementado en V3. Autenticación pública, reputación formal y chat quedan en los siguientes hitos del [backlog](backlog.md).

## Módulos

```text
packages/shared/src/
  sectors.ts        Definición tipada del primer nivel
  world.ts          Mapa derivado de sector, hexágonos, puerta
  hex.ts            Distancias y vecindad axial
  stats.ts          Siete atributos y cooldowns
  schema.ts         Estado de sala: jugadores, stats, fase, reloj, puerta
  protocol.ts       Mensajes tipados de acciones, botín e identidad

apps/server/src/
  index.ts          Bootstrap PostgreSQL, endpoint /health, sala canónica
  MercatumRoom.ts   Ciclo de sala, enlace de mensajes, tareas temporizadas
  domain/
    actionPlan.ts   Legitimidad, alcance, tiempos de interacción
    movement.ts     Validación pura de movimiento y puerta
    clock.ts        Hora fija del Mercado UTC−06:00
  storage/
    db.ts           Pool y transacciones SQL
    migrations.ts   Migraciones versionadas y semillas únicas
    characters.ts  Sesión anónima, personaje, cooldown, reingreso/extracción
    objects.ts     Inventarios, botín único, capacidad y abandono
    world.ts        Puerta de servicio duradera

apps/web/src/
  app/page.tsx      Composición (sin lógica de red)
  components/       Comprobante, ficha, croquis, acciones, incidentes
  hooks/            useCharacterBuild, useMercatumRoom, useTheme
  lib/              Geometría y proyección de Schema
  app/styles/       Estilos por responsabilidad (incluye expedition.css)
```

## Persistencia y admisión

En el primer ingreso, el navegador envía una **build válida** al matchmaking `join("mercatum")`. El servidor genera una cuenta pseudónima independiente del personaje; guarda el **hash SHA-256** de una credencial aleatoria en PostgreSQL y devuelve la credencial únicamente a la conexión dueña mediante el mensaje privado `identity` solicitado después de instalar listeners.

La credencial se guarda localmente bajo `mercatum.session.token`. En la siguiente admisión se presenta de nuevo, y el backend carga **el mismo personaje**, sus siete atributos, coordenadas, fase (`inside` / `outside` / `dead`) y tiempo permitido para el siguiente paso. Si el token no existe, el servidor exige una nueva build. Si el token es inválido, rechaza la admisión y **no crea silenciosamente otro personaje**.

El backend prohíbe dos conexiones simultáneas del mismo personaje. Los ID de socket Colyseus son transitorios; la identidad y la propiedad de objetos no dependen de esos IDs.

**Limitación:** esta credencial es adecuada para prueba local cerrada, no para autenticación pública ni recuperación de cuentas.

## Reglas de movimiento

1. `MarketMap` solicita un único hexágono vecino con `room.send("move",{to})`.
2. `domain/movement.ts` verifica las coordenadas, el permiso de estar dentro, la vecindad, obstáculos, estado de puerta y cooldown de Destreza.
3. `storage/characters.ts` confirma una actualización condicionada por posición y `next_move_at`. Un cliente no puede reordenar pasos o usar un reinicio como aceleración.
4. `MercatumRoom` actualiza el Schema y envía `move_accepted` con cooldown; si se rechaza, responde con un motivo.

No se simulan 60 FPS. `patchRate=200` se refiere a envíos de red, no a un bucle global. El reloj se revisa cada 10 segundos, solo muta al cambiar el minuto.

## Acciones temporizadas

La solicitud `action` se valida mediante `domain/actionPlan.ts` y programa una tarea con un temporizador; se informa por mensaje `action_started` y se puede interrumpir con `cancel_action` o al moverse.

Las acciones actuales son: abrir puerta por Fuerza o Intelecto, inspeccionar objeto, recogerlo y extraer botín desde la entrada. La resolución comprueba de nuevo que el usuario siga en su posición y que el objeto esté disponible. Los resultados de inventario se envían de forma privada y los del suelo se publican a los miembros de la sala.

La capacidad provisional de inventario es `4 + 2 × FUE` unidades. El depósito exterior `stash` es separado del inventario llevado `carried`. La transacción de extracción cambia todos los objetos llevados a depósito y el personaje a estado `outside` simultáneamente.

## Datos SQL

Las migraciones se ejecutan con bloqueo transaccional antes de escuchar peticiones. Tablas:

- `accounts`: ID estable y hash de token.
- `characters`: cuenta, build JSONB validada, posición, fase, cooldown.
- `world_state`: estado único de la puerta.
- `market_objects`: instancia única con estado exclusivo `ground | carried | stash`, posición o propietario.
- `event_log`: secuencia duradera de acciones de personaje/propiedad.
- `schema_migrations`: versiones aplicadas.

La semilla inicial crea **una sola navaja oxidada** y no la repone al reiniciar. El servidor usa `transaction()` con `BEGIN/COMMIT/ROLLBACK` para cambios atómicos de propiedad y extracción.

## Seguridad, visibilidad y deuda pendiente

- Solo `onJoin` con build válida o token real. `create` y `joinOrCreate` están deshabilitados.
- Los objetos de suelo son **públicos en V1**; no habrá criaturas ocultas hasta filtrar información por usuario (`X-018`).
- El token y los inventarios se envían únicamente por mensaje privado al dueño; los nombres/atributos están compartidos por el esquema de sala.
- Aún faltan autenticación de producción, recuperación de cuenta, rotación de credenciales, validación de orígenes, límites de admisión, protección XSS y respaldos probados.
- No hay muertes ni reglas de desconexión bajo amenaza. La sesión no equivale a extracción automática.
- Los jugadores conectados desde el depósito exterior **siguen ocupando una plaza de la sala**; la separación de lobby y sala de incursión queda para otro hito.

## Tests y operación

CI levanta PostgreSQL 16 temporal y ejecuta:

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm --filter @mercatum/server smoke
pnpm --filter @mercatum/server smoke:v1
pnpm --filter @mercatum/server smoke:v2
pnpm --filter @mercatum/server smoke:v3
```

El smoke V1 crea un **esquema PostgreSQL temporal aislado**, confirma que una disputa simultánea por el mismo objeto tiene un solo ganador, verifica la extracción, reinicia el backend y vuelve con el mismo token y el objeto en depósito. Luego borra solo el esquema temporal.

Para ejecución local (incluidos los pasos de Docker Compose), consultar [v1.md](v1.md). Para el estado del backlog y pendientes, consultar [backlog.md](backlog.md).

## V2 — Motor de amenazas

El scheduler `apps/server/src/CreatureScheduler.ts` mantiene un temporizador para la acción más próxima de cualquier criatura; las posiciones, intervalos y memoria se guardan en `storage/creatures.ts` con transacciones PostgreSQL. `domain/creatureLogic.ts` calcula visión, patrulla, caminos y daño con funciones probables unitariamente.

**No hay entidades hostiles en el Schema público.** `MercatumRoom.sendSightings` filtra la lista por estado, PER, rango y línea de visión y la envía solo al jugador por mensajes `sightings`. Tras un ataque, el servidor actualiza la salud/heridas del personaje, su Schema y el inventario privado. Las criaturas persiguen también a personajes desconectados, cuya situación continúa en PostgreSQL.

El estado `dead` es irreversible. Tras fallecimiento, los objetos `carried` pasan al suelo, los del depósito `stash` se conservan; un sucesor explícito puede heredar este depósito, sin recuperar el cuerpo ni las pertenencias perdidas. `docs/v2.md` contiene reglas detalladas y pruebas.

Las pruebas de integración de V1 deshabilitan hostiles, mientras `smoke:v2` comprueba exposición offline, caída de objetos y sucesión en un esquema PostgreSQL aislado.

## V3 — Transacciones y veracidad diferenciada

`MarketGateway.ts` recibe operaciones de Colyseus y solo muestra cotizaciones, anuncios y ofertas autorizadas por el servidor. `storage/market.ts` administra la moneda interna, mercader NPC, snapshots privados e IDs de operación; `storage/trades.ts` gestiona las ofertas y el intercambio atómico; `storage/provenance.ts` publica y consulta el registro externo. `domain/marketRules.ts` contiene reglas puras de precio y cercanía.

Los objetos son instancias únicas de PostgreSQL. Su cambio de estado, dueño o condición inserta automáticamente `object_events.kind='fact'` mediante trigger; `claim` es una fila independiente, escrita por el jugador fuera del edificio y con autor de cuenta. Un trigger impide UPDATE/DELETE de hechos y testimonios. Ninguna capa del cliente puede convertir un claim en fact.

Las compras y los intercambios utilizan bloqueo ordenado y transacciones con recibos idempotentes; `wallet_ledger` permite reconciliar saldos. El comerciante posee mercancía finita, y el depósito exterior es el estado seguro de inventario. La UI conserva los tres temas documentales con `MarketBoard` y `ProvenanceBoard`.

Las afirmaciones **no son certificaciones** y la base no implementa blockchain. [Contrato completo de V3](v3.md).

## Presentación organizada después de V3

La pantalla no es un dashboard monolítico de tres columnas. `app/page.tsx` mantiene una sola sesión `useMercatumRoom` y un mapa permanente. Personaje, comercio y archivo se abren mediante `WorkspaceModal` (`<dialog>` nativo), sin desmontar la exploración ni perder la conexión de red. La ventana muestra la salud y la alarma de amenazas en vivo; la interacción con el plano vuelve después de cerrarla. Comercio subdivide NPC y ofertas en componentes dentro de un mismo modal, sin alterar `MarketGateway`. Ver [docs/ui-navigation.md](ui-navigation.md).
