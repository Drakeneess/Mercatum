# Mercatum

**Mercatum** es un prototipo web de exploración en un mercado paranormal persistente. El Mercado no es una mazmorra: existe y funciona independientemente de los jugadores.

Este repositorio inicia el desarrollo con un mapa 2D de **61 hexágonos**, movimiento entre casillas adyacentes, un servidor WebSocket autoritativo y posiciones sincronizadas en una sesión multijugador.

## Estructura

```text
Mercatum/
├── apps/
│   ├── web/            Next.js + React + SVG
│   └── server/         Node.js + TypeScript + ws
├── packages/
│   └── shared/         Coordenadas hexagonales y protocolo
├── docs/               Notas técnicas y alcance
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

Después, abre **http://localhost:3000**. El servidor WebSocket escucha en **ws://localhost:3001/ws** y ofrece una comprobación HTTP en **http://localhost:3001/health**.

Abre dos pestañas del navegador para comprobar que las posiciones de ambos exploradores se actualizan en tiempo real. Haz clic en una casilla contigua iluminada para avanzar.

### Configuración opcional

Los valores por defecto funcionan sin archivos `.env`. Puedes copiar `apps/web/.env.example` a `apps/web/.env.local` para ajustar `NEXT_PUBLIC_WS_URL`, y `apps/server/.env.example` a `apps/server/.env` para ajustar `PORT` y `ALLOWED_ORIGINS`.

Si el frontend y el backend se alojan en dominios distintos, configura un origen permitido exacto para WebSocket y una URL `wss://` para conexiones públicas seguras.

## Comandos

```bash
pnpm dev         # Compila shared e inicia web + server
pnpm build       # Compila todos los paquetes
pnpm typecheck   # Verifica TypeScript
pnpm test        # Ejecuta pruebas del paquete shared
```

## Alcance actual

**Implementado**
- Mapa hexagonal y obstáculos fijos.
- Movimiento en tiempo real (no por turnos), solo a hexágonos adyacentes.
- Validación de posición, casillas bloqueadas y velocidad mínima de movimiento en servidor.
- Sesiones temporales simultáneas (máximo 20).
- Sincronización de entradas, salidas y movimientos mediante WebSocket.
- Reloj oficial fijo UTC−6, servido desde el backend.
- Reconexión automática del cliente y endpoint de salud.

**Todavía no implementado**
- Inicio de sesión y personajes persistentes.
- Guardado en PostgreSQL.
- Criaturas autónomas, encuentros y persecuciones.
- Comercio, inventarios y objetos únicos.
- Múltiples pisos, elevadores y escaleras.
- Permadeath y reglas de desconexión seguras.

**Importante:** Esta fase no representa todavía un mundo persistente: las posiciones se pierden si se reinicia el servidor o se cierra la conexión. El sistema de exploración debe estabilizarse antes de incorporar datos permanentes y consecuencias irreversibles.

Consulta [docs/architecture.md](docs/architecture.md) para límites del prototipo y pasos siguientes.
