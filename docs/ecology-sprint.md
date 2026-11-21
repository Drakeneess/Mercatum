# Mercatum — Sprint de ecología autónoma

## Propósito

Que el Mercado se sienta habitado **incluso si no hay jugadores conectados**. La fauna no es una colección de enemigos generados al acercarse el explorador: son entidades persistentes del sector. Las criaturas activas se ven en el plano todo el tiempo; es una decisión deliberada que reemplaza el ocultamiento por Percepción de V2.

## Reglas actuales

1. **Visibilidad constante:** todos los enemigos con salud positiva aparecen en el mapa. Se muestran nombre, ubicación y salud; los muertos dejan de aparecer como enemigos activos. PER queda reservado a detalles perceptivos/huellas futuros. La información se entrega en mensajes `sightings`, no en el Schema público.
2. **Ocupación exclusiva:** dos criaturas vivas no pueden ocupar el mismo hexágono. PostgreSQL impone `UNIQUE(q,r) WHERE health>0`, y la decisión de movimiento excluye todas las otras casillas ocupadas. La migración intenta recolocar duplicados antiguos en casillas transitables antes de imponer la restricción.
3. **Caminar autónomo:** cada criatura tiene su propio siguiente instante de acción persistido. Se mueve incluso si el servidor no tiene usuarios conectados, evita obstáculos, puertas cerradas y la zona segura, y prefiere no retroceder inmediatamente salvo si no hay otras salidas.
4. **Persecución:** cuando detecta un humano vivo, conserva las reglas de atención, memoria y velocidad de V2. Puede compartir hex con un personaje y atacarlo; la exclusividad de casillas solo afecta a **criatura versus criatura**.
5. **Combate entre criaturas:** especies diferentes a un hexágono de distancia pueden agredirse ocasionalmente, respetando el reloj de ataque del atacante y la recuperación del blanco. El combate no obliga a dos criaturas a solaparse, ni pausa su mundo.
6. **Daño y derrota:** 120 HP iniciales por criatura. Un ataque rival del Rastrero hace 14 de daño; uno del Rebuscador hace 9. La criatura a 0 HP deja de caminar y desaparece del conjunto de enemigos activos. Cada enfrentamiento crea una entrada `creature_clash` en el log permanente y una notificación de sesión.
7. **Objetos robados:** si una criatura derrotada llevaba mercancía robada, esta se deposita en su último hex con desgaste; conserva el mismo ID y procedencia.

## Restricciones económicas y de rendimiento

La población inicial del sector contiene dos criaturas. Se bloquean sus filas en orden estable durante una actualización, evitando solapamientos incluso con ejecuciones concurrentes. Los ticks se producen según el vencimiento individual, no por loop de 60 FPS. Este diseño encaja con el prototipo pequeño; con cientos de entidades habría que dividir el mapa en sectores y revisar cómo se aplican los bloqueos.

**Sin respawn automático:** las derrotas son permanentes en la implementación actual. Si ambos habitantes desaparecen, el sector puede quedar vacío. Para una versión persistente abierta sería necesario diseñar reproducción, migración, reaparición o presión de amenazas de otros sectores, sin inventar respawn de la nada. Tampoco existe todavía un sistema de combate entre humanos y criaturas.

## Verificación local

```powershell
cd D:\Mercatum\Mercatum
git status
git pull --ff-only origin main
docker compose up -d db
pnpm dev
```

Entra a `http://localhost:3500`. Los marcadores enemigos son visibles desde el inicio. Si ves a dos criaturas aproximarse a casillas adyacentes, podrían enfrentarse; el registro de incidentes anotará el ataque. Los puntos de vida de cada criatura se muestran junto a sus marcadores y en el informe de amenazas.

Para pruebas automatizadas (Postgres necesario):

```powershell
pnpm build
pnpm typecheck
pnpm test
pnpm --filter @mercatum/server smoke:v2
pnpm --filter @mercatum/server smoke:ecology
```

El nuevo test usa un esquema SQL temporal y verifica visibilidad universal, unicidad de hex, ataques entre rivales, caída del botín y persistencia de derrota entre reinicios.

**No ejecutes `docker compose down -v`** si quieres conservar personajes, objetos e historiales.

## Balance por comprobar manualmente

Observar cuánto tardan dos criaturas en encontrarse, cuántas peleas ocurren en una sesión normal, cuán estable es el patrullaje, si quedan atrapadas en pasillos, si otras criaturas deberían interesarse activamente por los combates y qué debe suceder cuando una especie desaparece del sector.
