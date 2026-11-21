# V4 · Sprint 1 — Voces cercanas

**Estado:** primera parte del hito de alfa privada implementada para pruebas locales. **No significa que Mercatum ya sea apto para el público.** Este sprint cubre S-041 y la base técnica de S-042/S-043; carga, observabilidad, staging y convocatoria corresponden a los siguientes sprints.

## Comunicación como proximidad física

El chat es **texto que funciona como voz local**. No existe canal global:

- Solo hablan personajes vivos con `phase=inside`. El exterior abstracto no tiene coordenadas para simular sonido, por lo que **no ofrece chat** hasta implementar una plaza exterior real.
- Un receptor debe encontrarse a **2 hexágonos o menos**, sin muros ni puertas cerradas en la línea de visión acústica simplificada. El servidor comprueba ambos extremos; la posición enviada por el navegador nunca se utiliza como autoridad.
- El mensaje tiene **1 a 160 caracteres** tras limpiar controles y espacios excesivos; React muestra texto, no HTML ejecutable.
- El servidor decide la audiencia en el momento de la entrega; un usuario distante, desconectado o muerto **no recibe paquetes** con mensajes ajenos.
- El emisor ve su mensaje en su propia hoja de comunicaciones, pero eso no certifica que todos los otros personajes lo hayan escuchado.
- No existe historial general persistente: al reconectar se vacía el buffer local. Las conversaciones ordinarias no se guardan en PostgreSQL.

La casilla de entrada también admite hablar con vecinos vivos. Conversar no activa acciones especiales ni pausa a las criaturas.

## Interfaz

En **Explorar → VOCES CERCANAS** aparece un expediente plegable, con contador de exploradores a alcance, fragmentos de la conversación de esta sesión (últimos 40), compositor y controles por mensaje.

La hoja está plegada por defecto para no volver al problema de menús interminables. El indicador de cercanía actualiza con movimientos, entradas, salidas y bajas. El compositor queda deshabilitado cuando no se conoce ningún interlocutor próximo. Puedes escribir y enviar con el botón **DECIR EN VOZ ALTA**.

La pestaña de Personaje, el comerciante y el Archivo mantienen su comportamiento modal. Abrir uno no pausa el chat ni el mundo.

## Protecciones mínimas

El servidor exige al menos **1,3 segundos** entre mensajes de cada cuenta y admite como máximo **5 mensajes por ventana móvil de 12 segundos**. Exceder ese ritmo no emite mensaje ni afecta a otros jugadores.

**Silenciar:** no recibir mensajes de una cuenta; la otra persona puede seguir escuchándote.

**Bloquear:** el emisor y el receptor dejan de escucharse mutuamente. El bloqueo se almacena por **cuentas**, no por IDs de personajes, y sobrevive al permadeath o a reabrir el navegador. Las preferencias pueden levantarse desde la hoja social.

**Reportar:** el servidor únicamente admite un identificador de mensaje que efectivamente entregó a esa sesión, en los últimos **5 minutos**. Guarda el texto realmente enviado, autor de cuenta, cuenta que reportó, motivo y fecha, en `chat_reports`. El usuario no puede inventar contenido de prueba con una solicitud manual ni reportarse a sí mismo. Un mismo mensaje no puede reportarse dos veces por la misma cuenta.

**No hay sanción automática:** un registro de reporte es evidencia para revisión humana futura; mentir sobre un objeto o sacar ventaja en un intercambio no es, por sí solo, una infracción de chat.

## Privacidad, coste y límites

`ChatGateway` enruta mensajes privados a los clientes válidos en la misma sala Colyseus. Los mensajes **no están en el Schema público** ni se emiten usando `broadcast`. El número máximo actual de clientes sigue siendo 20.

La preferencia de mute/bloqueo persiste en PostgreSQL (`chat_relationships`). El texto normal solo vive en la memoria de los clientes receptores durante la sesión; la memoria temporal del servidor retiene hasta 40 mensajes entregados por sesión durante un máximo de cinco minutos, exclusivamente para permitir reportes. Solo se escriben a la base los mensajes **reportados**.

La línea de visión es un modelo acústico inicial: todavía no simula atenuación por distancia, volumen variable, resonancias o sonido alrededor de esquinas. Tampoco incorpora chat de voz real ni transcripción de audio.

**Limitación anterior:** las posiciones de otros exploradores siguen presentes en el estado público de Colyseus. El chat sí se filtra por destinatario, pero el ocultamiento completo de jugadores en el mapa continúa pendiente en X-018 y debe resolverse antes de una alfa abierta.

Las herramientas mínimas de bloqueo/reporte **no equivalen a moderación de producción**. Falta panel de revisión, política de retención/borrado de reportes, apelaciones, control de identidades/recuperación de cuenta y pruebas de carga y abuso.

## Arranque local

```powershell
cd D:\Mercatum\Mercatum
git status
git pull --ff-only origin main
pnpm install
docker compose up -d db
pnpm dev
```

La migración V4 agrega dos tablas y no borra personas, objetos, monstruos, balances ni procedencia. El servidor aplica las migraciones automáticamente en el arranque.

Abre `http://localhost:3500` en **dos navegadores o dos contextos sin compartir credencial**. Mantén a ambos personajes vivos a dos hexágonos o menos. Abre **VOCES CERCANAS**, escribe algo con A y comprueba que B puede leerlo. Aleja a B más allá del rango y repite; B no debe recibir nada.

Verificación automatizada:

```powershell
pnpm build
pnpm typecheck
pnpm test
pnpm --filter @mercatum/server smoke:v1
pnpm --filter @mercatum/server smoke:v2
pnpm --filter @mercatum/server smoke:v3
pnpm --filter @mercatum/server smoke:v4
```

La prueba V4 utiliza un esquema PostgreSQL aislado y comprueba audiencia local, tercero distante, mensajes inválidos, límite de frecuencia, mute unilateral, bloqueo persistente, reportes con evidencia no inventable y recuperación del permiso al desbloquear.

## Próximo sprint

S-045/S-046: métricas de coste/latencia, carga de 20 jugadores, observabilidad, respaldo y restauración en staging. Solo entonces S-047: una alfa cerrada con casos reales de comercio, persecución y proximidad.
