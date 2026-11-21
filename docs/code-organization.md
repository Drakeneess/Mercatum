# Estructura de código — Mercatum

## Principios

Cada módulo debe tener una responsabilidad estable. La UI no decide si se permite un movimiento; Colyseus es la fuente de autoridad. Una habilidad nueva debe introducirse como una regla de dominio reutilizable, no como lógica incrustada en un archivo de página o en un callback de transporte.

## Estructura actual del frontend

```text
apps/web/src/
├── app/
│   ├── page.tsx                 # Mapa permanente y modal seleccionado
│   ├── layout.tsx               # CSS importado en orden
│   ├── globals.css              # Tokens y superficies compartidas
│   └── styles/
│       ├── workspace.css        # Navegación, mapa y responsive
│       ├── modals.css           # Ventanas documentales y hoja móvil
│       ├── commerce.css         # Formularios de mercado y archivo
│       ├── expedition.css       # Acciones e inventario
│       ├── threat.css           # Riesgos y heridas
│       ├── character.css        # Registro y stats
│       └── ...                  # Mapa, encabezado y tres temas
├── components/
│   ├── WorkspaceNavigation.tsx # Abrir expedientes sin desmontar el mapa
│   ├── WorkspaceModal.tsx      # Dialog nativo con manejo de foco
│   ├── ExpeditionStatus.tsx     # Estado persistente en todas las vistas
│   ├── MarketMap.tsx            # Croquis hexagonal
│   ├── SectorNotes.tsx          # Acciones e informes desplegables
│   ├── ExplorerColumn.tsx       # Registro y datos personales
│   ├── MarketActions.tsx        # Puerta, botín cercano, mochila y extracción
│   ├── MarketBoard.tsx          # Selección de modalidad comercial
│   ├── MerchantPanel.tsx        # Comprar/vender al NPC
│   ├── ExchangePanel.tsx        # Anunciar, ofertar y aceptar trueques
│   ├── ProvenanceBoard.tsx      # Archivo público de objetos
│   └── ...                      # Otros componentes documentales
├── hooks/
│   ├── useTheme.ts              # Tema local
│   ├── useCharacterBuild.ts     # Registro y sucesión de personajes
│   └── useMercatumRoom.ts       # Una sola sesión Colyseus
└── lib/
    ├── hexMapView.ts
    └── roomSnapshots.ts
```

El backend conserva las capas `MercatumRoom` / `MarketGateway` / `storage` /
`domain` y el paquete `@mercatum/shared` como contrato común.

## Flujo

1. `useCharacterBuild` construye una ficha local y solicita validación antes de conectar.
2. `useMercatumRoom` abre una sesión Colyseus, recibe el Schema y deriva snapshots de solo lectura para los componentes.
3. `MarketMap` dibuja el mapa y solicita movimientos; no actualiza posiciones de forma optimista.
4. `MercatumRoom` recibe el mensaje, consulta `resolveMovement` y, si es válido, muta las coordenadas del Schema.
5. Colyseus sincroniza el nuevo estado. La UI puede mostrar el cooldown, pero nunca autoriza desplazamientos por su cuenta.

## Dónde añadir una funcionalidad

- **Nueva estadística o protocolo:** `packages/shared`; pruebas junto a la regla.
- **Nueva acción interactiva:** tipo en `shared/protocol.ts`, validación pura en `server/domain`, registro en `MercatumRoom`, UI en `components`.
- **Nueva forma de mostrar el estado:** componente visual, no otro bloque gigante en `page.tsx`.
- **Nuevo tema:** colores y superficies en `styles/variants.css`, con el identificador correspondiente en `hooks/useTheme.ts`.
- **Nueva criatura autónoma:** scheduler y visibilidad en servidor; no agregar criaturas ocultas al Schema público.

## Invariantes

- Un mundo canónico y servidor autoritativo.
- El movimiento se realiza de hexágono en hexágono, con cooldown por Destreza.
- Las reglas se prueban sin necesidad de montar componentes React.
- La reconexión y el estado del jugador están centralizados en un hook.
- Los tres temas mantienen la misma jugabilidad.
- PostgreSQL persiste personajes, mercancías y criaturas. El mapa recibe todas las posiciones de criaturas activas con salud mediante mensajes, sin filtro por PER. Aún falta la política de visibilidad de otros exploradores.

## Verificación

```powershell
pnpm build
pnpm typecheck
pnpm test
pnpm --filter @mercatum/server smoke
```

Este diseño favorece archivos orientados a una responsabilidad; si `useMercatumRoom` crece mucho con inventario, comercio o criaturas, extraer el nuevo dominio a hooks y servicios adicionales en vez de ampliar el hook indefinidamente.

## V1: módulos nuevos

- `packages/shared/src/sectors.ts` define sectores como datos tipados; `world.ts` genera el mapa.
- `apps/server/src/storage/db.ts` gestiona conexiones y transacciones de PostgreSQL; `migrations.ts` aplica migraciones versionadas; `characters.ts`, `objects.ts`, `world.ts` guardan reglas durables por dominio.
- `apps/server/src/domain/actionPlan.ts` decide legitimidad/duración de acciones; `MercatumRoom.ts` programa su finalización, vuelve a validar y confirma la operación.
- `apps/web/src/components/MarketActions.tsx` presenta la puerta, la mercancía, el inventario y la extracción.
- `apps/web/src/app/styles/expedition.css` contiene los estilos de la nueva hoja de recuperación; se importa desde `app/layout.tsx`.
- `apps/server/src/smoke-v1.ts` verifica la permanencia de inventario tras reiniciar el backend en un esquema PostgreSQL temporal aislado.

El servidor ahora necesita PostgreSQL. La credencial local no sustituye la autenticación de producción. Véase [docs/v1.md](v1.md).

## V2 — Ubicación de amenazas y mortalidad

- `apps/server/src/CreatureScheduler.ts`: un temporizador por siguiente evento, sin ticks visuales.
- `apps/server/src/domain/creatureLogic.ts`: búsqueda de rutas, línea de visión, recuerdos y cálculo puro de daño; `creatureLogic.test.ts`.
- `apps/server/src/storage/creatures.ts`: transacciones SQL, ataques, robos y muertes, incluidas entidades actuando sin usuarios conectados.
- `apps/server/src/storage/characters.ts`: admite personajes muertos para consultar el expediente, crea sucesores cuando se presenta una build explícita y transfiere solo objetos del depósito exterior.
- `apps/server/src/smoke-v2.ts`: prueba de integración aislada de peligro offline, muerte irreversible y sucesión.
- `apps/web/src/components/ThreatReport.tsx` y `app/styles/threat.css`: salud, heridas y censo completo de criaturas vivas con estética documental.

**Regla actual:** añadir más criaturas a la base de datos, nunca a `MercatumState`. Todas las criaturas activas deben estar visibles en el mapa mediante mensajes privados por sesión, sin filtrar por Percepción.

## V3 — Mercado y registro externo

- `apps/server/src/MarketGateway.ts`: frontera entre mensajes de Colyseus y operaciones de comercio.
- `apps/server/src/storage/market.ts`: cuentas, saldo, tasaciones NPC, stock y publicación voluntaria.
- `apps/server/src/storage/trades.ts`: ofertas por sesión, aceptación de ambas partes y transferencias SQL atómicas.
- `apps/server/src/storage/provenance.ts`: testimonios atribuidos y consulta externa de historial.
- `apps/server/src/domain/marketRules.ts` y `marketRules.test.ts`: precios, rangos, cantidad e IDs seguros.
- `apps/web/src/components/MarketBoard.tsx`: pestañas de comercio; `MerchantPanel.tsx` contiene el mostrador y `ExchangePanel.tsx` los trueques y ofertas.
- `apps/web/src/components/ProvenanceBoard.tsx`: registro externo que separa hechos y claims.
- `apps/web/src/app/styles/commerce.css`: materiales gastados compatibles con los tres temas.
- `apps/server/src/smoke-v3.ts`: pruebas transaccionales y de procedencia contra esquema PostgreSQL temporal.

Para reglas económicas, precauciones de confianza y requisitos de despliegue: [docs/v3.md](v3.md).

## Reorganización del espacio de trabajo (después de V3)

`WorkspaceNavigation` mantiene Explorar como superficie principal y abre Personaje, Comercio y Archivo en un `WorkspaceModal` nativo sin cerrar `useMercatumRoom` ni desmontar el mapa. El modal incorpora salud y amenazas en vivo. `ExpeditionStatus` permanece visible en el plano y sus avisos de peligro facilitan orientarse. El panel lateral `SectorNotes` se limita a acciones de exploración y extractos desplegables. Comercio y Archivo son expedientes superpuestos independientes, nunca modales anidados. Los estilos del espacio de trabajo están en `app/styles/workspace.css` y los de ventanas superpuestas en `app/styles/modals.css`, importados al final de `layout.tsx`.

[Guía de navegación](ui-navigation.md). El refactor no altera el protocolo ni la autoridad del servidor.

## V4 Sprint 1 — Comunicación sin canal global

- `apps/server/src/ChatGateway.ts`: destinatarios por posición de servidor, mute/bloqueo, recibos breves para reportes y entrega privada.
- `apps/server/src/domain/chatRules.ts` y `chatRules.test.ts`: proximidad, obstáculos, contenido y límite de frecuencia.
- `apps/server/src/smoke-v4.ts`: varios clientes reales de Colyseus, cuenta bloqueada y reporte auditable en esquema PostgreSQL temporal.
- `apps/web/src/components/NearbyChat.tsx`: hoja plegable de voces cercanas y acciones por mensaje.
- `apps/web/src/app/styles/voice.css`: estilo para los tres temas con controles de teclado y móvil.
- `apps/web/src/hooks/useMercatumRoom.ts`: recibe mensajes privados de la sesión y envía comandos con identidad ya admitida.

No añadir mensajes de chat ni preferencias al Schema público ni convertir la hoja de voces en un feed global. [Guía de V4](v4-sprint1.md).

## Ecología visible y enfrentamientos autónomos

- `apps/server/src/domain/creatureLogic.ts`: rutas excluyendo otras criaturas vivas, vagabundeo sin vuelta inmediata, oportunidad de ataque a especies rivales.
- `apps/server/src/storage/creatures.ts`: bloqueo ordenado de entidades y transacciones de movimiento, combate, estado de salud y caída de objetos robados al morir.
- `apps/server/src/storage/migrations.ts`: salud persistente, siguiente momento de protección, posición anterior e índice SQL de casilla exclusiva para vivos.
- `apps/server/src/smoke-ecology.ts`: integración de visibilidad total, exclusividad SQL, rivalidad y patrulla sin personas.
- `apps/web/src/components/MarketMap.tsx`: marcadores constantes de entidades activas, con barra de HP.

[Contrato y deuda de ecología](ecology-sprint.md). No existe repoblación de especies derrotadas; diseñarla antes de operar el mundo continuo.
