# Mercatum — Dirección visual: horror documental

## Principio

**Mercatum no es un tablero táctico.** La interfaz debe provocar desconfianza: parece algo que alguien rescató, fotocopió, ensució y siguió utilizando por necesidad. No buscamos elegancia, luces pulidas, cajas simétricas ni sensación de control.

El Mercado funciona aunque nadie lo vigile. Los documentos solo registran lo que los humanos creen haber visto.

## Los tres soportes (menú «CAMBIAR SOPORTE»)

### 01 · Libro de incidencias (`oxide`, inicial)

Un expediente de oficina manchado, gastado y mal archivado. Papeles amarillentos, tinta negra, correcciones rojas, sellos torcidos, tachaduras, bordes rotos y anotaciones marginales.

**No:** pergamino de fantasía elegante, detalles dorados, estética de inventario RPG lujoso.

### 02 · Cinta de vigilancia (`phosphor`)

Imagen de un monitor antiguo, lavada y con errores de fotocopia electrónica. Verde grisáceo apagado, scanlines, esquinas rotas y texto áspero. No es una estación militar: es el CCTV encontrado en una habitación de mantenimiento.

**No:** interfaces sci-fi, hologramas perfectos, neón brillante de videojuego competitivo.

### 03 · Turno de cierre (`vigil`)

Recibos térmicos gastados y señalética rota de comercio antiguo: fluorescentes agotados, papeles verde-amarillentos, manchas, metal ennegrecido y tipografía incómoda de supermercado.

**No:** cyberpunk elegante, barra de navegación premium, boutique de terror.

## Estructura de la pantalla

1. **Masthead:** el nombre MERCATUM ocupa espacio como un rótulo poco confiable; la advertencia ocupa la primera franja.
2. **Comprobante de entrada:** contiene operador, localización y estado, pero no parece una tarjeta de identificación militar.
3. **Plano incompleto:** el hexágono sigue funcionando; el mapa se presenta como croquis recuperado, intervenido con notas. El usuario nunca debe confundir marcas de ambientación con datos reales.
4. **Extractos y bitácora:** se imprimen como hojas deterioradas, no dashboards KPI.
5. **Menú de soporte:** tres variantes del mismo expediente. Se guarda con `localStorage["mercatum.ui.theme"]`.

## Restricciones de usabilidad

- El daño es solo una textura o ambientación; **nunca** altera las coordenadas o la forma de calcular vecinos.
- Los hexágonos disponibles se siguen destacando, los bloqueos se diferencian y las etiquetas conservan contraste legible.
- La interfaz no inventa información sobre entidades, peligros, comercios ni apariciones. Los datos visibles proceden del estado real.
- Se respetan `prefers-reduced-motion`, navegación con teclado y reescalado en pantallas pequeñas.
- La elección de tema no vuelve a conectar el cliente ni modifica el estado de Colyseus.

## Implementación

- `apps/web/src/app/page.tsx`: contenido diegético, selector nativo y SVG interactivo; el networking no se ha reemplazado.
- `apps/web/src/app/globals.css`: tres superficies con materiales distintos y textura procedural CSS, sin imágenes ni tipografías descargadas.
- `apps/web/src/app/layout.tsx`: layout global de Next.js.

El resultado deliberadamente evita la estética de tablero táctico bonito. Es un documento de supervivencia parcial, hostil y usado.
