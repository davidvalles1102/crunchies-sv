---
name: Crunchies — Neón y Sabor
description: Sistema de gestión de restaurante — warm dark mode, naranja encendido
colors:
  bg-0:            "#0E0908"
  bg-1:            "#160C09"
  bg-2:            "#1E1210"
  bg-3:            "#261510"
  bg-4:            "#2E1A12"
  bg-5:            "#3A1913"
  text-primary:    "#FFFFFF"
  text-secondary:  "#BFA099"
  text-muted:      "#7A5248"
  orange:          "#FF6600"
  orange-dim:      "#7A3000"
  orange-dark:     "#3D1800"
  orange-alpha:    "rgba(255,102,0,0.10)"
  amber:           "#FF9900"
  amber-dim:       "#7A4A00"
  amber-dark:      "#3D2400"
  danger:          "#FF4455"
  info:            "#4A9EE0"
typography:
  display:
    fontFamily: "'Bangers', 'Poppins', sans-serif"
    fontSize: "3rem"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.06em"
  headline:
    fontFamily: "'Bangers', 'Poppins', sans-serif"
    fontSize: "1.6rem"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "0.04em"
  body:
    fontFamily: "'Poppins', system-ui, sans-serif"
    fontSize: "0.88rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "'Poppins', system-ui, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 600
    letterSpacing: "0.07em"
rounded:
  sm: "6px"
  md: "10px"
  lg: "16px"
  xl: "24px"
spacing:
  xs:  "4px"
  sm:  "8px"
  md:  "16px"
  lg:  "24px"
  xl:  "32px"
components:
  button-primary:
    backgroundColor: "{colors.orange}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "#FF7A1F"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-amber:
    backgroundColor: "{colors.amber}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  card:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
  input:
    backgroundColor: "{colors.surface-high}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
  badge-green:
    backgroundColor: "{colors.neon-green-dark}"
    textColor: "{colors.neon-green}"
    rounded: "100px"
    padding: "3px 10px"
  badge-amber:
    backgroundColor: "{colors.neon-amber-dark}"
    textColor: "{colors.neon-amber}"
    rounded: "100px"
    padding: "3px 10px"
---

# Design System: Neón y Sabor Mi Rancho

## 1. Overview

**Creative North Star: "El Rancho Encendido"**

Raíces auténticas de rancho cruzadas con energía neón. Lo que huele a fogata, se ve encendido. Este sistema no imita ningún referente extranjero de restaurante — es colombiano, local, y se ve mejor que cualquier cosa importada. El fondo es negro profundo porque el neón solo brilla en la oscuridad. Los colores calientes (verde eléctrico, ámbar dorado) no son decoración: son señales funcionales que emergen de un canvas que deliberadamente no compite con ellos.

La densidad es media-alta: este es un sistema operativo, no una landing page. Los meseros, el personal de cocina y los administradores actúan bajo presión de tiempo real. Cada pixel tiene que justificarse con utilidad. Los clientes que escanean el QR entran a un flujo que debe funcionar en su primer intento, sin instrucciones.

Este sistema rechaza explícitamente: la frialdad corporativa del fast food genérico, la fealdad tabular de los sistemas ERP heredados, la genericidad de las apps de delivery que podrían ser de cualquier restaurante, y el minimalismo blanco que le roba identidad al negocio. La noche aquí es el ambiente, no un accidente de diseño.

**Key Characteristics:**
- Fondo ultra-oscuro en 6 pasos (void → surface-top) como base tonal
- Dos acentos neón (verde primario, ámbar secundario) con vocabulario de brillo (glow)
- Tipografía dual: Rajdhani para jerarquía de datos, Inter para cuerpo operativo
- Elevación a través de brillo neón en estado activo, no de sombras tradicionales
- Bordes translúcidos (rgba) como separadores que no pesan visualmente

## 2. Colors

Un canvas de negro profundo con dos acentos que nunca compiten entre sí — el verde manda en acciones primarias, el ámbar en alertas y estados secundarios.

### Primary
- **Verde Neón Eléctrico** (`#39FF14`): El color de acción. Botón principal, estados activos, texto de énfasis, bordes de elementos seleccionados, indicadores de disponibilidad. Siempre acompañado de su glow (`0 0 6px #39FF14, 0 0 14px rgba(57,255,20,0.4)`) en estados interactivos.
- **Verde Neón Dim** (`#1a7a09`): Bordes de elementos con acento verde. Nunca como color de texto.
- **Verde Neón Dark** (`#0d3d05`): Superficie de fondo para badges y chips verdes. El triángulo oscuro que hace resaltar el verde eléctrico.

### Secondary
- **Ámbar Dorado** (`#FFB300`): Alertas, órdenes en cocina, elementos "en proceso", precios destacados, texto de número de orden. Evocador del fuego y la fogata — caliente pero no agresivo.
- **Ámbar Dim** (`#7a5500`): Bordes de badges ámbar.
- **Ámbar Dark** (`#3d2b00`): Superficie de fondo para badges ámbar.

### Tertiary
- **Peligro Encendido** (`#FF3B3B`): Exclusivo para acciones destructivas (eliminar, cancelar, liberar mesa con advertencia) y estados de error. Prohibido como decoración.
- **Info Azul** (`#00BFFF`): Notificaciones informativas pasivas. Menor uso que los otros acentos.

### Neutral
- **Void** (`#080808`): Fondo más profundo — body background, pantallas de carga.
- **Noche** (`#0f0f0f`): Background principal de páginas.
- **Superficie** (`#161616`): Paneles, sidebars, contenedores primarios.
- **Superficie Elevada** (`#1e1e1e`): Cards, modales, headers de sección.
- **Superficie Alta** (`#252525`): Inputs, tab buttons inactivos, hover states de tabla.
- **Superficie Cima** (`#2e2e2e`): El tono más claro de la escala neutra. Separadores, bordes de hover.
- **Tinta Principal** (`#F2ECD8`): Texto de cuerpo. Blanco cálido levemente cremoso — nunca blanco puro, que chirriaría contra el negro del canvas.
- **Tinta Secundaria** (`#9E9080`): Labels, metadata, texto de soporte.
- **Tinta Apagada** (`#5A5045`): Placeholders, texto deshabilitado.

**The Neon Earns Its Glow Rule.** El verde y el ámbar brillan (`box-shadow` / `text-shadow` con glow) solo en estados activos, seleccionados o de hover. En reposo, los elementos que usan estos colores como borde o texto no tienen glow. El glow debe sorprender, no fatigar.

## 3. Typography

**Display Font:** Rajdhani (con fallback Inter, sans-serif)
**Body Font:** Inter (con fallback system-ui, sans-serif)

**Character:** Rajdhani es técnico, condensado y de alta energía — perfecto para números de orden, nombres de mesa, totales, y titulares de sección. Inter es neutro y legible bajo cualquier condición — lleva todo el texto operativo que el staff y los clientes leen en movimiento. El contraste entre ambas crea jerarquía sin necesidad de color adicional.

### Hierarchy
- **Display** (Rajdhani, 700, clamp(2rem–3rem), line-height 1.1, tracking +0.04em): Títulos de pantalla completa, marca, números grandes en dashboard. Máximo 6rem en cualquier contexto; por encima el sistema grita.
- **Headline** (Rajdhani, 600, 1.35rem, line-height 1.3, tracking +0.02em): Headers de sección, nombres de mesa en banner, títulos de modal.
- **Title** (Inter, 600, 1.1rem, line-height 1.4): Nombres de platillo en tarjeta, títulos de card, labels de formulario prominentes.
- **Body** (Inter, 400, 0.9rem, line-height 1.55): Todo el texto operativo. Descripción de platillos, notas de orden, contenido de tabla. Línea máxima 65ch en texto de párrafo continuo.
- **Label** (Inter, 600, 0.78rem, tracking +0.06em, UPPERCASE): Headers de tabla, categorías de badge, metadata de estado. El uppercase es exclusivo de este rol — prohibido en cuerpo de texto.

**The Rajdhani-Only-for-Data Rule.** Rajdhani aparece solo en jerarquías de display y datos numéricos de alto impacto (totales, contadores, IDs de orden). No se usa para texto de párrafo ni instrucciones al usuario — Inter lo reemplaza inmediatamente en cuanto el contenido necesita ser leído linealmente.

## 4. Elevation

Este sistema es **plano en reposo, encendido en acción**. No existen sombras ambient tradicionales. La profundidad se construye exclusivamente a través de la escala tonal de fondos (void → surface-top) y el vocabulario de brillo neón reservado para estados activos.

Cuando un elemento necesita "flotar" sobre el contenido (modales, toasts, dropdowns), lo hace con un backdrop semitransparente oscuro (`rgba(0,0,0,0.75)` + `backdrop-filter: blur(6px)`) que enfatiza la separación sin inventar una fuente de luz falsa.

**The Flat-By-Default Rule.** Ningún elemento tiene `box-shadow` en su estado de reposo excepto los botones primarios (que llevan el glow-s como parte de su identidad de acción). El glow aparece como respuesta a estado — hover, focus, selected — nunca decorativamente. Si el glow aparece en más del 10% de los elementos en pantalla simultáneamente, hay algo incorrecto.

### Shadow Vocabulary
- **Glow verde intenso** (`0 0 8px #39FF14, 0 0 24px rgba(57,255,20,0.5), 0 0 48px rgba(57,255,20,0.2)`): Hover de botón primario, elementos en estado de alerta positiva.
- **Glow verde suave** (`0 0 6px #39FF14, 0 0 14px rgba(57,255,20,0.4)`): Estado de reposo del botón primario, texto neon en banner.
- **Glow ámbar intenso** (`0 0 8px #FFB300, 0 0 24px rgba(255,179,0,0.5), 0 0 48px rgba(255,179,0,0.2)`): Hover de botón ámbar.
- **Glow ámbar suave** (`0 0 6px #FFB300, 0 0 14px rgba(255,179,0,0.4)`): Texto ámbar en pantallas de éxito, IDs de orden.
- **Focus ring verde** (`0 0 0 3px rgba(57,255,20,0.12)`): Estado de focus en inputs. Sutil — señal de accesibilidad sin ruido visual.
- **Modal backdrop** (`rgba(0,0,0,0.75)` + `blur(6px)`): Separación de capas para modales y sheets. No es una sombra — es una pantalla.

## 5. Components

### Buttons
El botón es el punto donde el sistema tiene más personalidad. Forma funcional, retroalimentación inmediata.

- **Forma:** Bordes redondeados moderados (10px). No pill (demasiado soft), no cuadrado (demasiado ERP). El radius de 10px comunica modernidad sin perder seriedad operativa.
- **Primary (verde):** Fondo `#39FF14`, texto negro `#080808`, box-shadow verde suave en reposo. Hover: glow intenso + `translateY(-1px)`. El lift de 1px es táctil — se siente antes de verse.
- **Amber:** Idéntico al primary en comportamiento, fondo `#FFB300`. Para acciones de advertencia o contexto de orden.
- **Outline:** Fondo transparente, borde `rgba(255,255,255,0.12)`. Hover: borde se vuelve verde, texto verde. No hay glow en outline — la señal es el cambio de color.
- **Ghost:** Sin borde ni fondo. Hover: fondo `surface-high`. Para acciones secundarias dentro de componentes (botones de cantidad en carrito, opciones de tabla).
- **Danger:** Fondo `danger-dim`, texto y borde rojo. Hover: fondo se convierte en rojo sólido. La transición de "advertencia" a "confirmación destructiva" sucede en el hover.
- **Sizes:** sm (6px/14px, 0.82rem) para contextos densos (acciones de tabla, chips de filtro), base (10px/20px, 0.9rem) estándar, lg (14px/28px, 1rem) para CTAs de pantalla completa.

### Cards / Containers
- **Corner Style:** 16px (rounded-lg) como estándar. 24px (rounded-xl) para sheets móviles y modales. 10px (rounded-md) para elementos inline como badges expandidos.
- **Background:** `surface-raised` (#1e1e1e) como base. Jamás fondo blanco ni gris claro.
- **Elevation Strategy:** Sin sombra en reposo. Hover: `border-color` sube de `border` a `border-lit`. Cards de acción con acento (card-green, card-amber) muestran glow suave en hover.
- **Border:** Siempre presente — `1px solid rgba(255,255,255,0.06)` en reposo. Sin borde es permitido solo dentro de contenedores ya bordeados.
- **Internal Padding:** 20px estándar, 24px para cards de dashboard con más espacio de respiración.

### Inputs / Fields
- **Estilo:** Fondo `surface-high`, borde `border-lit` (0.12 opacity), radius 10px. El fondo más claro que el contexto garantiza legibilidad sin contraste forzado.
- **Focus:** Borde cambia a `neon-green`, focus ring verde suave (`0 0 0 3px rgba(57,255,20,0.12)`). Claro, inconfundible, no agresivo.
- **Placeholder:** Color `ink-muted` (#5A5045) — visible pero subordinado al contenido real.
- **Error:** Aún no especificado en el sistema actual — usar `danger` como color de borde con `danger-dim` como fondo.

### Badges
Elementos compactos de estado. Siempre pill (border-radius 100px), siempre color sobre fondo oscuro del mismo hue.
- **Verde:** `neon-green-dark` bg + `neon-green` text + `neon-green-dim` border. Para estados "disponible", "activo", "completado".
- **Ámbar:** Ídem en escala ámbar. Para "en cocina", "en proceso", "pendiente".
- **Danger:** `danger-dim` bg + `danger` text. Para "cancelado", "error".
- **Muted:** `surface-top` bg + `ink-secondary` text. Para estados neutros o deshabilitados.

### Navigation (Admin Sidebar)
- Fondo: `surface` (#161616), borde derecho `border` (0.06 opacity).
- Links: texto `ink-secondary` en reposo, fondo transparente.
- Hover: fondo `surface-raised`, texto `ink`.
- Activo: fondo con acento verde suave, texto `neon-green`, borde izquierdo verde 3px.
- Logo/Brand: Rajdhani bold, verde neón con glow-s.

### Category Tabs (Signature Component)
Chips de filtro de categoría — presentes tanto en el menú del cliente como en el POS del admin.
- Reposo: fondo `surface-raised`, borde `border`, texto `ink-secondary`, radius 20px (pill semi-completo).
- Hover: fondo `surface-high`, borde `border-lit`.
- Activo: fondo `neon-green-dark`, texto `neon-green`, borde `neon-green-dim`, box-shadow `0 0 10px rgba(57,255,20,0.12)`. El tab activo brilla suavemente — no grita, pero se distingue sin ambigüedad.

## 6. Do's and Don'ts

### Do:
- **Do** usar `#39FF14` (verde neón) exclusivamente para acciones primarias, estados activos y confirmaciones positivas. Su rareza es su poder.
- **Do** usar `#FFB300` (ámbar) para estados en progreso, alertas no críticas y precios destacados. Verde = acción completada. Ámbar = acción en curso.
- **Do** usar Rajdhani solo para display, números y datos de alta jerarquía. Inter para todo lo que el usuario necesita leer.
- **Do** aplicar el glow como respuesta a estado (hover/focus/active). El glow en reposo es permitido solo en el botón primary y texto de marca.
- **Do** usar la escala tonal de 6 fondos para crear profundidad. bg-0 para la base, bg-2/3 para contenedores, bg-4/5 para elementos interactivos.
- **Do** mantener bordes como `rgba(255,255,255,0.06)` — translúcidos, no sólidos. Los bordes sólidos blancos rompen la atmósfera oscura.
- **Do** aplicar `backdrop-filter: blur()` en modales y sheets sobre contenido para mantener el contexto visible.

### Don't:
- **Don't** usar fondos blancos o grises claros en ningún componente. Ni siquiera en estados hover. Este sistema es dark-only — no existe modo claro.
- **Don't** imitar el estilo frío y corporativo de apps de fast food (McDonald's, KFC): tipografía roja/amarilla brillante sobre blanco, bordes redondeados extremos, layouts de tipo catálogo sin densidad operativa.
- **Don't** construir vistas con tablas grises y sin jerarquía visual, como los sistemas ERP de los 2000s. Cada tabla tiene header con uppercase tracked y fondo `surface-high`. Las filas alternan en hover, no en color sólido.
- **Don't** replicar el look de Uber Eats o Rappi: cards de delivery con imágenes grandes, precio y CTA. Este es un sistema de operación presencial — el contexto es la mesa, no el carrito de entrega.
- **Don't** usar fondos blancos con texto oscuro bajo la premisa de "minimalismo". El blanco aquí no es minimalismo — es pérdida de identidad.
- **Don't** poner más de dos acentos neón activos simultáneamente en pantalla. Verde y ámbar pueden coexistir en contexto (un botón verde + un badge ámbar), pero evitar que ambos brillen en `glow-intenso` al mismo tiempo.
- **Don't** usar el border-radius 100px (pill completo) para botones principales. El pill es exclusivo de badges y category chips. Los botones de acción usan 10px.
- **Don't** agregar sombras ambient (`box-shadow: 0 4px 12px rgba(0,0,0,0.4)`) a cards o paneles. La profundidad aquí es tonal, no de sombra.
