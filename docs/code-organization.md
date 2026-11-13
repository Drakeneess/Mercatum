# Estructura de código — Mercatum

## Principios

Cada módulo debe tener una responsabilidad estable. La UI no decide si se permite un movimiento; Colyseus es la fuente de autoridad. Una habilidad nueva debe introducirse como una regla de dominio reutilizable, no como lógica incrustada en un archivo de página o en un callback de transporte.

## Estructura actual del frontend

```text
apps/web/src/
├── app/
│   ├── page.tsx                 # Destino seleccionado y composición
│   ├── layout.tsx               # CSS importado en orden
│   ├── globals.css              # Tokens y superficies compartidas
│   └── styles/
│       ├── workspace.css        # Navegación, vistas y responsive
│       ├── commerce.css         # Formularios de mercado y archivo
│       ├── expedition.css       # Acciones e inventario
│       ├── threat.css           # Riesgos y heridas
│       ├── character.css        # Registro y stats
│       └── ...                  # Mapa, encabezado y tres temas
├── components/
│   ├── WorkspaceNavigation.tsx # Explorar / Personaje / Comercio / Archivo
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
- PostgreSQL persiste personajes y mercancías; las criaturas se filtran por visión en mensajes privados. Aún falta filtrar la posición de otros exploradores.

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
- `apps/web/src/components/ThreatReport.tsx` y `app/styles/threat.css`: salud, heridas y avistamientos privados con estética documental.

**Regla de privacidad:** añadir más criaturas a la base de datos, nunca a `MercatumState`. Su posición solo puede llegar al cliente a través del filtro de visión del servidor.

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

`WorkspaceNavigation` selecciona uno de cuatro destinos sin cerrar `useMercatumRoom`. `ExpeditionStatus` permanece visible siempre que exista registro; sus avisos de peligro son un acceso directo al mapa. El panel lateral `SectorNotes` se limita a acciones de exploración y extractos desplegables. Comercio y Archivo se renderizan como páginas de contenido independientes. Todos los estilos específicos están en `app/styles/workspace.css` importado al final de `layout.tsx`.

[Guía de navegación](ui-navigation.md). El refactor no altera el protocolo ni la autoridad del servidor.
