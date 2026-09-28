# PROMPT MAESTRO — Plataforma de aprendizaje y simulación de PLC ("SimPLC", nombre provisorio)

> Instrucción para Claude Code: este documento es la especificación completa del proyecto.
> Léelo entero antes de escribir código. Trabaja **fase por fase** (sección 12).
> Al terminar cada fase: ejecuta los tests, levanta el servidor, verifica visualmente,
> y **detente** a esperar mi aprobación antes de pasar a la siguiente.
> Tengo experiencia básica programando: explícame en español, brevemente, qué hiciste
> y cómo probarlo. Prefiero que tú hagas el código y yo solo revise.

---

## 1. Visión del proyecto

Plataforma web gratuita, bilingüe (español / inglés), para que **cualquier persona curiosa**
aprenda PLC desde cero hasta un nivel **intermedio y cercano a la realidad industrial**.

Pilares:
1. **Simulador PLC en el navegador**, fácil e intuitivo, con estética técnica tipo CAD
   (inspiración: CircuitLab, AutoCAD). Parte con **Ladder (LD)** y luego suma
   **Structured Text (ST)**, **Function Block Diagram (FBD)**, **Instruction List (IL)**
   y **SFC** (IEC 61131-3). El usuario puede **cambiar entre lenguajes**.
2. **Contenido teórico**: qué es un PLC y cómo funciona, conexiones, puertos y
   comunicaciones, marcas y sus diferencias, software de programación.
3. **Ejemplos didácticos de procesos** con plantas virtuales animadas (cosas tangibles:
   motor, semáforo, estanque, portón, cinta transportadora…).
4. **Colección de desafíos** del más básico al más complejo, con corrección automática.
5. Glosario y preguntas frecuentes.

Objetivo a mediano plazo: convertirlo en un producto real con usuarios y comunidad.

Restricciones clave:
- **Sin registro ni cuentas**. Sin base de datos en esta etapa.
- Los programas del usuario se guardan en el navegador (autoguardado) y se pueden
  **descargar / cargar como archivo** en su PC.
- Presupuesto: $0 en infraestructura (solo se pagará el dominio).
- Simulador: **solo escritorio**. Contenido teórico: **responsive** (celular y escritorio).

---

## 2. Stack tecnológico

| Área | Tecnología | Motivo |
|---|---|---|
| Framework | **Astro** (usa Vite internamente) | Páginas de contenido rápidas y con buen SEO (importante para crecer y para aprobación futura de AdSense) |
| Interactividad | **React + TypeScript** como "islas" de Astro | Simulador, editores y plantas animadas |
| Estilos | **Tailwind CSS** con tokens de diseño en variables CSS | Tema claro/oscuro consistente |
| Contenido | **MDX** con Content Collections de Astro | Editar la teoría sin tocar código |
| i18n | Rutas i18n nativas de Astro (`/es/...`, `/en/...`) + diccionario JSON para la UI de React | Bilingüe desde el día 1 |
| Estado del simulador | **Zustand** | Simple y liviano |
| Editor Ladder / FBD | **Editor propio en SVG** sobre grilla (no librería de grafos) | Control total del aspecto tipo CAD y del modelo de peldaños |
| Editor ST / IL | **Monaco Editor** (`@monaco-editor/react`) con resaltado personalizado | Experiencia tipo IDE |
| Animaciones | SVG + CSS / **Framer Motion** | Plantas virtuales y micro-interacciones |
| Tests | **Vitest** (motor y lógica) + **Playwright** (e2e y capturas) | Verificar cada fase |
| Calidad | ESLint + Prettier + TypeScript `strict` | Menos errores |
| Deploy | **Vercel** (sitio estático) | Gratis, deploy automático desde GitHub |
| Futuro | Supabase (solo cuando existan comunidad / panel de profesores) | No se usa ahora |

Reglas técnicas:
- Nombres de código, carpetas y variables **en inglés**; textos visibles vía i18n.
- Ningún texto visible *hardcodeado*: todo pasa por el sistema de traducciones.
- El **motor de ejecución PLC** debe ser TypeScript puro, sin dependencias de React,
  para poder testearlo aislado.
- El nombre del sitio debe estar en **una sola constante** (`src/config/site.ts`) porque aún no está definido.
- Usar `localStorage` solo con try/catch y funcionar igual si está vacío o bloqueado.

---

## 3. Estructura de carpetas sugerida

```
/
├─ src/
│  ├─ config/site.ts              # nombre, URLs, links de donación
│  ├─ i18n/ { es.json, en.json, index.ts }
│  ├─ layouts/                    # BaseLayout, DocsLayout, SimulatorLayout
│  ├─ components/
│  │  ├─ ui/                      # botones, tabs, tooltips, tablas, callouts
│  │  ├─ content/                 # diagramas interactivos del PLC, tablas comparativas
│  │  └─ layout/                  # header, footer, selector idioma, selector tema
│  ├─ content/
│  │  ├─ learn/{es,en}/*.mdx      # teoría
│  │  ├─ glossary/{es,en}.json
│  │  ├─ faq/{es,en}.json
│  │  ├─ examples/*.json          # ejemplos precargados
│  │  └─ challenges/*.json        # desafíos con casos de prueba
│  ├─ simulator/
│  │  ├─ engine/                  # motor: scan cycle, memoria, instrucciones
│  │  │  ├─ memory.ts
│  │  │  ├─ scan.ts
│  │  │  ├─ instructions/         # contacts, coils, timers, counters, compare, math
│  │  │  └─ __tests__/
│  │  ├─ languages/
│  │  │  ├─ ladder/               # modelo, editor SVG, compilador a IR
│  │  │  ├─ st/                   # parser, compilador a IR
│  │  │  ├─ fbd/
│  │  │  ├─ il/
│  │  │  └─ sfc/
│  │  ├─ ir/                      # representación intermedia común
│  │  ├─ plants/                  # plantas virtuales animadas
│  │  ├─ io-panel/                # tablero de entrenamiento (switches, LEDs)
│  │  ├─ challenges/              # validador automático
│  │  ├─ store/                   # Zustand
│  │  └─ file/                    # exportar/importar .simplc.json
│  ├─ pages/
│  │  ├─ [lang]/index.astro
│  │  ├─ [lang]/learn/[...slug].astro
│  │  ├─ [lang]/simulator.astro
│  │  ├─ [lang]/examples/...
│  │  ├─ [lang]/challenges/...
│  │  ├─ [lang]/glossary.astro
│  │  ├─ [lang]/faq.astro
│  │  └─ [lang]/support.astro     # donaciones
│  └─ styles/tokens.css
├─ tests/e2e/                     # Playwright
├─ public/
└─ CLAUDE.md                      # resumen de convenciones para futuras sesiones
```

---

## 4. Diseño visual

### Estilo general
Industrial / técnico, **profesional y serio**. Limpio, con mucho espacio en blanco en el
contenido y una estética **tipo CAD** en el simulador (grilla fina, barras de herramientas
compactas, panel de propiedades, barra de estado). Nada infantil ni recargado.

### Paleta (definir como variables CSS, con modo claro y oscuro)

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--bg` | `#FFFFFF` | `#0F172A` | Fondo general |
| `--surface` | `#F5F7FA` | `#16213A` | Tarjetas, paneles |
| `--surface-2` | `#E9EEF5` | `#1E2A45` | Barras de herramientas |
| `--border` | `#D4DCE6` | `#2B3A5A` | Bordes |
| `--text` | `#1B2433` | `#E6ECF5` | Texto principal |
| `--text-muted` | `#5B6B82` | `#9AA8BF` | Texto secundario |
| `--primary` | `#1F4E9A` | `#4C86E8` | Azul corporativo: enlaces, botones, selección |
| `--primary-hover` | `#173D7A` | `#6A9CF0` | |
| `--grid` | `#EDF1F6` | `#1A2640` | Grilla del simulador |
| `--wire-off` | `#8A97AB` | `#5E6D86` | Conductor sin energía |
| `--wire-on` | `#16A34A` | `#22C55E` | Conductor energizado (flujo de potencia) |
| `--led-on` | `#22C55E` | `#4ADE80` | Salida activa |
| `--warning` | `#D97706` | `#F59E0B` | Advertencias |
| `--danger` | `#DC2626` | `#F87171` | Paro de emergencia, errores |

Reglas:
- El color de energizado (verde) se usa **solo** para estado lógico activo, nunca decorativo.
- Contraste AA mínimo en ambos temas.
- El simulador debe ser cómodo por largas sesiones: sin fondos saturados, sin animaciones
  distractoras en la zona de edición.

### Tipografía
- UI y contenido: **Inter** (o IBM Plex Sans).
- Código, direcciones y valores: **JetBrains Mono** (o IBM Plex Mono).
- Autohospedar las fuentes (paquetes `@fontsource`).

### Tema
Selector claro / oscuro / sistema en el header. Recordar la elección en `localStorage`.

### Ilustraciones y animaciones
- Hazlas tú directamente en **SVG** (estilo lineal técnico, trazo uniforme, acentos en azul).
- Ilustración principal del home: un PLC modular estilizado con módulos de E/S y LEDs
  que se encienden en secuencia sutil.
- Íconos: **Lucide**.
- Respetar `prefers-reduced-motion`.
- No usar logos de marcas registradas; solo sus nombres en texto.

---

## 5. Secciones del sitio

### 5.1 Home
- Hero con ilustración animada del PLC, título, subtítulo y 2 CTA: "Aprender" y "Abrir simulador".
- Tarjetas de las 4 rutas: Fundamentos, Hardware y conexiones, Marcas y software, Práctica.
- Vista previa del simulador (captura o mini demo no editable de partida/parada de motor).
- Botón discreto de donación en el footer.

### 5.2 Aprender (contenido teórico, MDX, responsive)
Orden sugerido, **enfocado en funcionamiento, no en historia**:

1. **¿Qué es un PLC?** Definición simple, dónde se usa, comparación breve con relés y
   con microcontroladores (Arduino).
2. **Cómo funciona por dentro**: CPU, memoria, módulos de E/S, fuente de poder.
   **Ciclo de scan** explicado con un diagrama animado (leer entradas → ejecutar programa →
   escribir salidas → diagnóstico) y enlace a verlo en vivo en el simulador.
3. **Tipos de PLC**: compacto, modular, de rack, PLC de seguridad, PAC, relé programable.
4. **Entradas y salidas**:
   - Digitales vs analógicas (0–10 V, 4–20 mA).
   - Sensores **PNP vs NPN** (sourcing / sinking) con diagramas de cableado interactivos.
   - Salidas a relé, transistor y triac: cuándo usar cada una.
   - Actuadores típicos: contactores, solenoides, pilotos, variadores.
   - Botoneras NA/NC y por qué el paro de emergencia se cablea NC.
5. **Conexiones y cableado**: alimentación 24 VDC / 220 VAC, común, borneras, esquema
   típico de un tablero. **Diagrama interactivo**: un PLC dibujado donde al hacer clic en
   cada borne o puerto aparece qué es y cómo se conecta.
6. **Puertos y comunicaciones**: USB, RS-232, RS-485, Ethernet. Protocolos: Modbus RTU/TCP,
   Profibus, Profinet, EtherNet/IP, CC-Link, EtherCAT, OPC UA. Qué es un HMI y un SCADA.
   Tabla: protocolo → marca asociada → medio físico → uso típico.
7. **Memoria y direccionamiento**: bits, bytes, words, marcas internas, y cómo nombra
   cada marca sus direcciones (Siemens `I0.0 / Q0.0 / M0.0`, Allen-Bradley por tags,
   Mitsubishi `X0 / Y0 / M0`, Omron `0.00 / 100.00`, etc.).
8. **Lenguajes IEC 61131-3**: LD, FBD, ST, IL (mencionar que está obsoleto en la 3ª edición
   pero aún se ve en equipos antiguos), SFC. Mismo ejemplo en los 5 lenguajes con pestañas.
9. **Instrucciones fundamentales**: contactos, bobinas, set/reset, flancos, enclavamiento,
   timers (TON, TOF, TP), contadores (CTU, CTD, CTUD), comparadores, matemáticas, move.
10. **Buenas prácticas reales**: comentarios, nombres de variables, seguridad, enclavamientos,
    por qué no confiar solo en el software para la seguridad.

Cada página: índice lateral, tiempo de lectura, "anterior / siguiente", callouts de
"En la industria…" y botón "Probar en el simulador" que abre un ejemplo precargado.

### 5.3 Marcas y software
- Tarjeta por marca: **Siemens, Allen-Bradley (Rockwell), Schneider Electric, Mitsubishi
  Electric, Omron, ABB, Delta, WEG**. Mencionar **CODESYS** como entorno IEC usado por
  varios fabricantes.
- Para cada una: gamas principales (de pequeña a gran escala), software de programación,
  si existe versión gratuita o pagada, sectores donde es fuerte, nomenclatura de direcciones,
  presencia en Latinoamérica/Chile y dificultad de aprendizaje.
- **Tabla comparativa** filtrable.
- Sección "¿Por qué algunos softwares son tan caros?": licencias para grandes plantas,
  redundancia, integración con SCADA y soporte, versus software gratuito para gamas pequeñas.
- **Importante**: verifica la información de productos, software y licencias con fuentes
  oficiales antes de escribirla. No inventes precios; si no hay dato confiable, usa rangos
  cualitativos ("gratuito", "licencia pagada", "licencia de alto costo") y la fecha de revisión.
- Aviso legal: marcas pertenecen a sus dueños; sitio independiente y educativo.

### 5.4 Simulador (solo escritorio)
Ver sección 6. En pantallas < 1024 px mostrar un aviso amable: "El simulador está
diseñado para escritorio" con enlace a la teoría.

### 5.5 Ejemplos
Galería de procesos didácticos, cada uno con descripción, lista de E/S, planta animada
y programa precargado abierto en el simulador. Ver sección 7.

### 5.6 Desafíos
Colección progresiva con corrección automática. Ver sección 8.

### 5.7 Glosario y FAQ
- Glosario con búsqueda y filtro alfabético, bilingüe (término en ambos idiomas).
- FAQ en acordeón.

### 5.8 Apoyar el proyecto
Página simple con links de donación (sección 10).

---

## 6. Simulador — especificación

### 6.1 Layout tipo CAD
```
┌──────────────────────────────────────────────────────────────────────┐
│ Barra superior: Archivo ▾ | Lenguaje: [LD|ST|FBD|IL|SFC] | ▶ Run ⏸ ⏹ ⏭ Paso │
│                 Velocidad | Direcciones: [Genérico|Siemens|AB|Mitsubishi|Omron]│
├───────────┬──────────────────────────────────────┬───────────────────┤
│ Paleta de │                                      │ Propiedades del   │
│ instruc-  │   Área de edición (grilla)           │ elemento          │
│ ciones    │   o editor de código                 │ seleccionado      │
│ (arrastrar│                                      ├───────────────────┤
│ y soltar) │                                      │ Tabla de variables│
│           │                                      │ / monitor         │
├───────────┴──────────────────────────────────────┴───────────────────┤
│ Panel inferior (pestañas): Tablero E/S | Planta virtual | Consola | Scan │
├──────────────────────────────────────────────────────────────────────┤
│ Barra de estado: RUN/STOP · tiempo de ciclo · nº errores · zoom · idioma │
└──────────────────────────────────────────────────────────────────────┘
```
Paneles redimensionables. Zoom y desplazamiento en la grilla. Atajos de teclado
(Ctrl+Z / Ctrl+Y, Supr, Ctrl+S = descargar, F5 = run, F6 = stop, F10 = paso).

### 6.2 Motor de ejecución
- Representación intermedia (IR) común: **todos los lenguajes compilan a la misma IR**,
  y el motor solo ejecuta IR. Esto permite cambiar de lenguaje y comparar.
- Ciclo de scan real: copiar entradas a imagen de proceso → ejecutar → escribir salidas.
- Tiempo de ciclo configurable (por defecto 10 ms simulados) y velocidad x0.25 a x4.
- Timers basados en el tiempo simulado, no en `setTimeout`.
- Memoria: entradas digitales, salidas digitales, marcas (bits), words/enteros, reales,
  entradas y salidas analógicas, timers, contadores.
- Instrucciones mínimas: NO, NC, flanco positivo/negativo, bobina, bobina negada, Set,
  Reset, TON, TOF, TP, CTU, CTD, CTUD, comparadores (=, <>, <, >, <=, >=), ADD, SUB, MUL,
  DIV, MOVE, escalado analógico simple.
- Modos:
  - **Normal**: ejecución continua (por defecto).
  - **Paso a paso**: ejecuta un scan por clic.
  - **Visualizar scan** (modo aprendizaje): resalta en orden cada fase del ciclo y
    cada peldaño mientras se evalúa, lento, con explicación breve.
- Tests unitarios exhaustivos del motor con Vitest (cada instrucción, timers con
  tiempo simulado, orden de evaluación, set/reset con prioridad).

### 6.3 Editor Ladder (primer lenguaje)
- Carriles de potencia izquierdo y derecho; peldaños (rungs) numerados con comentario.
- Colocar elementos arrastrando desde la paleta a celdas de la grilla; ramas en paralelo.
- Asignar dirección / nombre simbólico a cada elemento desde el panel de propiedades,
  con autocompletado desde la tabla de variables.
- En RUN: **flujo de potencia visible** (conductores en `--wire-on`), valores en vivo de
  timers y contadores sobre cada bloque.
- Validación en tiempo real: elementos sin dirección, bobinas duplicadas (advertencia),
  peldaños abiertos.
- Forzado de variables desde el monitor (con indicador visible de "forzado").

### 6.4 Lenguajes siguientes
- **ST**: Monaco con resaltado IEC, autocompletado de variables, errores subrayados.
  Soportar IF/ELSIF/ELSE, CASE, FOR, WHILE, asignaciones, llamadas a FB (TON, CTU…).
- **FBD**: bloques en grilla conectados con cables, mismo estilo visual que LD.
- **IL**: editor de texto con listado de instrucciones.
- **SFC**: etapas, transiciones y acciones, con la etapa activa resaltada.
- Selector de lenguaje en la barra superior. Al cambiar:
  - Si existe conversión automática confiable (LD ↔ FBD, LD → ST, LD → IL para lógica
    simple), ofrecer "Convertir programa actual".
  - Si no, abrir el mismo proyecto en ese lenguaje vacío o con el ejemplo equivalente,
    explicando por qué no se puede convertir automáticamente.

### 6.5 Estilos de direccionamiento
Selector "Genérico / Siemens / Allen-Bradley / Mitsubishi / Omron" que solo cambia cómo
se **muestran** las direcciones (la memoria interna es la misma). Muy útil para aprender
las diferencias entre marcas.

### 6.6 Tablero de entrenamiento (E/S)
- Panel tipo maleta de entrenamiento: 16 entradas con interruptores (mantenidos) y
  pulsadores (momentáneos), seleccionables por entrada; 16 salidas con LEDs.
- 2 entradas analógicas con potenciómetro deslizante y 2 salidas analógicas con barra.
- Etiquetas editables por entrada/salida.

### 6.7 Plantas virtuales
Componentes SVG animados que se conectan a las E/S del programa (sección 7).
Cada planta define su mapa de E/S y su física simple (nivel que sube, cinta que avanza).

### 6.8 Guardar y cargar (sin base de datos)
- **Autoguardado** del proyecto actual en `localStorage`.
- **Descargar proyecto** como archivo `.simplc.json` (incluye lenguaje, programa,
  tabla de variables, etiquetas, planta asociada y versión del formato).
- **Cargar proyecto** desde archivo (arrastrar o seleccionar), con validación del esquema (Zod).
- **Exportar ST** como `.st` para que el usuario lo vea en texto.
- Futuro (dejar preparado, no implementar ahora): exportar a PLCopen XML para abrir en
  CODESYS u otros entornos compatibles.

---

## 7. Ejemplos didácticos (plantas virtuales)

Ordenados por dificultad. Cada uno: planta animada + programa en Ladder (y luego en otros
lenguajes) + explicación paso a paso bilingüe.

1. Encender una ampolleta con un interruptor.
2. **Partida y parada de motor con enclavamiento** (marcha NA, paro NC, contactor, relé térmico).
3. Motor con inversión de giro y enclavamiento eléctrico.
4. **Semáforo** de un cruce (timers en secuencia).
5. **Portón automático** (finales de carrera, sensor de obstáculo, luz de advertencia).
6. **Llenado de estanque** con sensores de nivel alto/bajo y bomba.
7. **Partida estrella-triángulo** con temporizador.
8. **Cinta transportadora con contador de cajas** y detención al completar lote.
9. Estacionamiento con contador de cupos y letrero "LLENO".
10. Clasificación de piezas por tamaño en cinta con dos sensores y un pistón.
11. **Mezcladora por lotes (batch)**: llenado de dos ingredientes, mezcla temporizada,
    vaciado (secuencia, ideal para SFC).
12. Dos bombas con alternancia y respaldo ante falla.
13. Control de temperatura on/off con histéresis (entrada analógica) de un horno.
14. Control de nivel analógico con salida proporcional (introducción a PID, conceptual).

Implementar las plantas de forma incremental (ver fases), empezando por 1, 2, 4 y 6.

---

## 8. Desafíos con corrección automática

- Formato JSON por desafío: id, nivel (1–5), título y enunciado bilingües, E/S disponibles,
  planta opcional, instrucciones permitidas, pistas progresivas y **casos de prueba**.
- Caso de prueba = secuencia de pasos `{ tiempo, entradas }` y aserciones
  `{ tiempo, salidas esperadas }`, ejecutadas en el motor en modo acelerado.
- Resultado: lista de casos aprobados/fallidos con explicación de qué se esperaba.
- Progreso guardado en `localStorage` (marcar completados), sin cuentas.
- Mínimo 20 desafíos al final del proyecto, desde "enciende una salida" hasta secuencias
  con timers, contadores y analógicas. Comenzar con 8.

---

## 9. Internacionalización

- Rutas `/es/` y `/en/`; detectar idioma del navegador en la primera visita y
  recordar la elección.
- Selector de idioma en el header que mantiene la página actual.
- Contenido MDX duplicado por idioma; si falta una traducción, mostrar la versión en español
  con un aviso.
- Glosario, FAQ, ejemplos y desafíos con campos `es` y `en`.
- Mensajes de error del compilador y del simulador también traducidos.

---

## 10. Monetización (no invasiva)

**Ahora (fase final del MVP):**
- **Donaciones** vía un enlace externo, lo más simple posible y sin backend.
  Dejar configurables en `site.ts`: Ko-fi o Buy Me a Coffee (internacional) y un enlace
  de pago de Mercado Pago (Chile). Botón discreto en footer y página "Apoyar el proyecto".
  Nada de pop-ups.

**Más adelante (dejar preparado, desactivado por defecto con una bandera en `site.ts`):**
- **Anuncios** (Google AdSense) solo en páginas de contenido, máximo 1–2 espacios por
  página, reservando su alto para no mover el contenido. **Nunca** dentro del simulador
  ni de los desafíos.
- Aviso de cookies y política de privacidad (necesarios para AdSense).
- Ideas futuras (no implementar): panel para profesores, certificados, comunidad para
  compartir programas (ahí sí se usaría Supabase).

---

## 11. Calidad, SEO y accesibilidad

- Lighthouse ≥ 90 en rendimiento, accesibilidad, buenas prácticas y SEO en páginas de contenido.
- Metadatos por página, Open Graph, `sitemap.xml`, `robots.txt`, `hreflang` es/en.
- Navegable por teclado, `aria-labels` en controles del simulador, foco visible.
- Cargar el simulador solo en su página (code splitting); Monaco con carga diferida.
- Página 404 y manejo de errores del simulador sin romper la página.
- Analítica respetuosa y gratuita (Vercel Web Analytics), sin cookies de seguimiento.

---

## 12. Plan de trabajo por fases

**Regla en cada fase:**
1. Implementar solo lo de la fase.
2. Ejecutar `npm run lint`, `npm run test` y `npm run build` sin errores.
3. Ejecutar Playwright: navegar las páginas nuevas, tomar capturas en tema claro y oscuro,
   en escritorio y móvil (móvil solo para contenido), y revisarlas tú mismo.
4. Corregir lo que falle antes de reportar.
5. Entregarme un resumen corto en español: qué se hizo, cómo probarlo (`npm run dev` y
   la URL), qué quedó pendiente. Hacer commit con mensaje claro.
6. **Esperar mi aprobación.**

| Fase | Contenido |
|---|---|
| **0. Base** | Proyecto Astro + React + TS + Tailwind, ESLint/Prettier, Vitest, Playwright, estructura de carpetas, `CLAUDE.md` con convenciones, repositorio Git. |
| **1. Esqueleto visual** | Tokens de diseño, tema claro/oscuro, i18n es/en, header, footer, layouts, home con hero e ilustración SVG animada. |
| **2. Contenido I** | Sistema MDX de "Aprender" con índice, navegación y callouts. Páginas 1–4 de la sección 5.2 en ambos idiomas, diagrama animado del ciclo de scan. |
| **3. Motor PLC** | Memoria, IR, ciclo de scan, instrucciones de bits, set/reset, flancos. Tests exhaustivos. Sin interfaz aún. |
| **4. Editor Ladder** | Layout CAD, paleta, grilla, peldaños, ramas, propiedades, tabla de variables, deshacer/rehacer, flujo de potencia en RUN, tablero de E/S. |
| **5. Timers, contadores y más** | TON/TOF/TP, CTU/CTD/CTUD, comparadores, matemáticas, move; valores en vivo; modo paso a paso y visualizar scan; estilos de direccionamiento. |
| **6. Archivos** | Autoguardado, descargar/cargar `.simplc.json`, validación. |
| **7. Plantas y ejemplos I** | Motor de plantas, ejemplos 1, 2, 4 y 6 con su página y botón "abrir en simulador". |
| **8. Desafíos** | Validador automático y los primeros 8 desafíos. |
| **9. Contenido II** | Páginas 5–10 de "Aprender", diagrama interactivo de bornes y puertos, sección Marcas y software con tabla comparativa. |
| **10. Glosario, FAQ, apoyo** | Glosario con búsqueda, FAQ, página de donaciones, aviso legal. SEO y sitemap. **→ Primer deploy en Vercel (MVP).** |
| **11. Structured Text** | Monaco, parser y compilador ST a IR, conversión LD → ST, exportar `.st`. |
| **12. FBD** | Editor FBD y conversión LD ↔ FBD. |
| **13. Plantas y ejemplos II** | Ejemplos restantes, analógicas en tablero y plantas. |
| **14. IL y SFC** | Editores, compiladores; mezcladora batch en SFC. |
| **15. Más desafíos y pulido** | Completar 20+ desafíos, rendimiento, accesibilidad, preparar AdSense desactivado. |

---

## 13. Qué NO hacer

- No agregar registro, cuentas ni base de datos.
- No usar logos oficiales de marcas.
- No inventar especificaciones, precios o datos de productos: verificar o dejar cualitativo.
- No poner anuncios ni pop-ups en el simulador.
- No avanzar de fase sin mi aprobación.
- No introducir librerías pesadas sin explicarme por qué.

---

## 14. Primer mensaje esperado de Claude Code

Antes de escribir código, respóndeme con:
1. Confirmación de que entendiste el proyecto en 5 líneas.
2. Dudas o riesgos técnicos que veas (especialmente en el motor y el editor Ladder).
3. Versiones de las dependencias principales que usarás.
4. Luego comienza la **Fase 0**.
