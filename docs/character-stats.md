# Aptitudes del explorador — Mercatum 0.3

## Propósito

Un personaje no es un héroe; es una persona que entra con capacidades y carencias concretas. Los siete atributos iniciales se almacenan y validan en el servidor.

| Código | Campo de red | Aplicación futura |
| --- | --- | --- |
| FUE | strength | Fuerza, cargas y obstáculos |
| DES | dexterity | **Cooldown de paso entre hexágonos (implementado)** |
| RES | endurance | Resistencia física y fatiga |
| PER | perception | Rastros y amenaza detectable |
| INT | intellect | Análisis y mecanismos |
| TRA | social | Interacciones y negociación |
| TEM | composure | Control ante situaciones de estrés |

## Creación

- Base: 1 en cada una de las siete estadísticas.
- Reparto: 7 puntos adicionales, para 14 puntos totales.
- Rango de creación: 1–3 por atributo; valores 0 y 4–5 reservados para el futuro.
- Predeterminado: `2,2,2,2,2,2,2`; se restan puntos de una aptitud para invertirlos en otra.
- Plantillas: Equilibrado; Corredor (DES 3, FUE 1); Rastreador (PER 3, TRA 1).
- La ficha queda fijada al confirmar el ingreso y solo dura la sesión actual. Un reinicio o nueva entrada genera una nueva identidad, hasta que exista persistencia.

El cliente puede mostrar una build propuesta, pero el servidor valida números enteros, rango, suma y conjunto exacto de siete campos. No confiar en el almacenamiento local para autoridad de juego.

## Movimiento discreto

| Destreza | Tiempo mínimo entre pasos |
| --- | --- |
| 0 | 1400 ms (futuro estado alterado) |
| 1 | 1200 ms |
| 2 | 1050 ms |
| 3 | 900 ms |
| 4 | 800 ms (futura progresión) |
| 5 | 700 ms (futura progresión) |

Solo un hexágono vecino por comando; no existe distancia adicional por subir Destreza. `MercatumRoom` rechaza un paso si aún no se alcanzó `nextMoveAt`. Un intento rechazado no consume ni reinicia el cooldown. La respuesta aceptada lleva `cooldownMs` y la rechazada por cadencia puede llevar `retryAfterMs`.

El indicador del frontend es informativo: si el reloj cliente diverge, el servidor sigue siendo la fuente de verdad.

## Futuro

- Escenarios de Fuerza para puertas, carga y empuje.
- Resistencia para fatiga, heridas y recuperación.
- Percepción frente a indicios perceptibles, nunca omnisciencia.
- Intelecto para pruebas de análisis, Trato para negociación y Temple para presión.
- Cuentas, almacenamiento persistente de personajes, progreso, inventario y permadeath.
- Estado privado y filtrado por jugador: el prototipo actual expone los siete atributos en la sala compartida.
