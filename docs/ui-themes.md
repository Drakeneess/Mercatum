# Dirección visual — Mercatum UI

Mercatum es un mercado anómalo, no un centro de mando futurista. La interfaz debe sugerir documentación precaria, infraestructura reutilizada y una presencia comercial que no necesita al jugador para existir.

## Tres atmósferas

### 01 · Archivo oxidado (predeterminado)
- **Concepto:** expediente húmedo rescatado de un depósito de mantenimiento.
- **Paleta:** carbón, cuero ennegrecido, tinta amarillenta y óxido.
- **Forma:** bordes irregulares visualmente, remates de documento, sellos y números administrativos.
- **Mapa:** papel técnico ennegrecido, trazos gastados, marcadores color latón.
- **Uso:** lectura prolongada, narrativa, exploración base.

### 02 · Fósforo muerto
- **Concepto:** terminal de vigilancia CRT conectada a un sistema de identificación antiguo.
- **Paleta:** verdes de fósforo sobre negro profundo; avisos desaturados.
- **Forma:** tipografía monoespaciada, esquinas duras y líneas de estado.
- **Mapa:** cuadrícula electrónica y marcas verdes con resplandor controlado.
- **Uso:** jugadores que prefieren un lenguaje técnico áspero.

### 03 · Vigilia
- **Concepto:** persiana metálica medio levantada y pasillos iluminados por neón agotado.
- **Paleta:** azul casi negro, violeta frío, rosa ceniza y luz cálida marginal.
- **Forma:** bordes levemente redondeados, sombras profundas y reflejos de luminaria.
- **Mapa:** marcas frías con halo y periferia oscurecida.
- **Uso:** ambientación de horror nocturno, lectura ambiental.

## Componentes permanentes

El selector **APARIENCIA** del encabezado elige entre los tres temas sin reiniciar la conexión. El registro de incursión, reloj UTC−6, mapa SVG hexagonal, leyenda, bitácora y estado del sector se mantienen en todas las variantes.

La percepción del peligro no depende de una animación o contraste engañoso: casillas adyacentes conservan un borde destacado, las bloqueadas siguen diferenciándose y el jugador usa un marcador específico.

## Implementación

- `apps/web/src/app/page.tsx`: estado `theme`, menú, persistencia, semántica y mapa único.
- `apps/web/src/app/globals.css`: tokens, estilos comunes, tres variantes, adaptación responsive.
- Valores: `oxide`, `phosphor`, `vigil`. Valor por defecto: `oxide`.
- Persistencia: `window.localStorage["mercatum.ui.theme"]`; si el almacenamiento falla, el tema continúa funcionando durante la sesión.
- Contraste: conservar el texto esencial sobre superficies opacas.
- Movimiento: evitar efectos que dificulten la selección de hexágonos. Se respeta `prefers-reduced-motion`.

Los temas son únicamente una capa de presentación. No deben alterar el comportamiento de Colyseus, el tiempo del Mercado ni revelar información oculta.
