# Estructura de código — Mercatum

## Principios

Cada módulo debe tener una responsabilidad estable. La UI no decide si se permite un movimiento; Colyseus es la fuente de autoridad. Una habilidad nueva debe introducirse como una regla de dominio reutilizable, no como lógica incrustada en un archivo de página o en un callback de transporte.

## Estructura

```text
apps/web/src/
├── app/
│   ├── page.tsx                  # Composición de la pantalla, sin lógica de red
│   ├── layout.tsx                # Imports ordenados de CSS global
│   ├── globals.css              # Reset, paleta y texturas compartidas
│   └── styles/
│       ├── masthead.css         # Nombre, avisos y selector de apariencia
│       ├── paper.css            # Fichas de papel, comprobantes y reloj
│       ├── map.css              # Croquis hexagonal y leyenda
│       ├── evidence.css         # Incidencias, bitácora y pie de página
│       ├── variants.css         # Tres tratamientos de horror documental
│       ├── responsive.css       # Adaptación para pantallas estrechas
│       └── character.css        # Ficha de stats y cooldown del movimiento
├── components/
│   ├── MarketHeader.tsx
│   ├── ExplorerColumn.tsx
│   ├── CharacterSheet.tsx
│   ├── MarketMap.tsx
│   └── SectorNotes.tsx
├── hooks/
│   ├── useTheme.ts              # Tema guardado localmente
│   ├── useCharacterBuild.ts     # Distribución y firma de aptitudes
│   └── useMercatumRoom.ts       # Red, reconexión, estado y movimiento
└── lib/
    ├── hexMapView.ts            # Geometría SVG
    └── roomSnapshots.ts         # Proyección Schema → vista y diagnóstico

apps/server/src/
├── index.ts                     # Bootstrap, health y sala canónica
├── MercatumRoom.ts              # Lifecycle y aplicación de comandos
├── smoke.ts                     # Integración real de Colyseus
└── domain/
    ├── character.ts            # Validación y creación de exploradores
    ├── clock.ts                # Tiempo oficial UTC−06:00
    ├── movement.ts             # Decisión pura de movimiento
    └── movement.test.ts        # Pruebas unitarias de movimiento

packages/shared/src/
├── schema.ts                    # Estado sincronizado
├── protocol.ts                  # Mensajes y snapshots
├── stats.ts                     # Límites, atributos y tiempos
├── hex.ts                       # Reglas hexagonales
└── world.ts                     # Mapa base
```

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
- No se ha agregado persistencia de personajes ni control de visibilidad de entidades ocultas.

## Verificación

```powershell
pnpm build
pnpm typecheck
pnpm test
pnpm --filter @mercatum/server smoke
```

Este diseño favorece archivos orientados a una responsabilidad; si `useMercatumRoom` crece mucho con inventario, comercio o criaturas, extraer el nuevo dominio a hooks y servicios adicionales en vez de ampliar el hook indefinidamente.
