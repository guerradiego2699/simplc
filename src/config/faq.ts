/**
 * Frequently asked questions (spec 5.7), grouped. Answers are plain text paragraphs; `{site}` is
 * replaced with SITE.name when rendering.
 */
import type { Locale } from './site';

export const FAQ_GROUPS = ['project', 'simulator', 'learning'] as const;
export type FaqGroup = (typeof FAQ_GROUPS)[number];

export interface FaqEntry {
  id: string;
  group: FaqGroup;
  question: Record<Locale, string>;
  answer: Record<Locale, string[]>;
}

export const FAQ: readonly FaqEntry[] = [
  {
    id: 'free',
    group: 'project',
    question: { es: '¿{site} es gratis?', en: 'Is {site} free?' },
    answer: {
      es: [
        'Sí. Todo el contenido, el simulador, los ejemplos y los desafíos son gratuitos y no necesitas crear una cuenta.',
        'El proyecto se mantiene con donaciones voluntarias. No hay anuncios en el simulador ni en los desafíos.',
      ],
      en: [
        'Yes. All the content, the simulator, the examples and the challenges are free and you do not need an account.',
        'The project is kept alive by voluntary donations. There are no ads in the simulator or the challenges.',
      ],
    },
  },
  {
    id: 'data',
    group: 'project',
    question: {
      es: '¿Dónde se guardan mis programas y mi progreso?',
      en: 'Where are my programs and progress stored?',
    },
    answer: {
      es: [
        'Solo en tu navegador (almacenamiento local). No los enviamos a ningún servidor.',
        'Si borras los datos del navegador o cambias de computador, se pierden. Para conservar un programa, descárgalo con Archivo → Descargar proyecto; luego puedes abrirlo en cualquier equipo.',
      ],
      en: [
        'Only in your browser (local storage). We do not send them to any server.',
        'If you clear your browser data or switch computers, they are lost. To keep a program, download it with File → Download project; you can then open it on any computer.',
      ],
    },
  },
  {
    id: 'affiliation',
    group: 'project',
    question: {
      es: '¿Están asociados con alguna marca de PLC?',
      en: 'Are you affiliated with any PLC brand?',
    },
    answer: {
      es: [
        'No. Es un sitio independiente y educativo. Mencionamos marcas solo para explicar cómo trabaja cada una; sus nombres pertenecen a sus dueños.',
      ],
      en: [
        'No. This is an independent educational site. We mention brands only to explain how each one works; their names belong to their owners.',
      ],
    },
  },
  {
    id: 'errors',
    group: 'project',
    question: {
      es: 'Encontré un error. ¿Cómo lo informo?',
      en: 'I found a mistake. How do I report it?',
    },
    answer: {
      es: [
        'Abre un reporte (issue) en el repositorio de GitHub del proyecto, enlazado al pie de cada página. Indica la página, qué esperabas y qué ocurrió.',
      ],
      en: [
        'Open an issue in the project’s GitHub repository, linked at the bottom of every page. Tell us the page, what you expected and what happened.',
      ],
    },
  },
  {
    id: 'mobile',
    group: 'simulator',
    question: {
      es: '¿Por qué el simulador no funciona en el celular?',
      en: 'Why does the simulator not work on my phone?',
    },
    answer: {
      es: [
        'El simulador es un editor tipo CAD con paneles, arrastrar y soltar y atajos de teclado: necesita una pantalla de al menos 1024 px de ancho. Las páginas de teoría, ejemplos y desafíos sí se pueden leer en el celular.',
      ],
      en: [
        'The simulator is a CAD-like editor with panels, drag and drop and keyboard shortcuts: it needs a screen at least 1024 px wide. The theory, example and challenge pages can be read on a phone.',
      ],
    },
  },
  {
    id: 'real-plc',
    group: 'simulator',
    question: {
      es: '¿Puedo cargar el programa en un PLC real?',
      en: 'Can I download the program to a real PLC?',
    },
    answer: {
      es: [
        'No directamente. El simulador es una herramienta para aprender: cada marca usa su propio software y formato de archivo.',
        'Lo que aprendes sí se traslada: los contactos, bobinas, temporizadores y contadores funcionan igual en cualquier PLC que siga la norma IEC 61131-3.',
      ],
      en: [
        'Not directly. The simulator is a learning tool: each brand uses its own software and file format.',
        'What you learn does carry over: contacts, coils, timers and counters work the same on any PLC that follows IEC 61131-3.',
      ],
    },
  },
  {
    id: 'languages',
    group: 'simulator',
    question: {
      es: '¿Qué lenguajes de programación admite el simulador?',
      en: 'Which programming languages does the simulator support?',
    },
    answer: {
      es: [
        'Hoy, Ladder (LD). Texto estructurado (ST), bloques de funciones (FBD), lista de instrucciones (IL) y SFC llegarán en próximas versiones; todos se ejecutarán sobre el mismo motor.',
      ],
      en: [
        'Today, Ladder (LD). Structured text (ST), function block diagram (FBD), instruction list (IL) and SFC will come in future versions; all of them will run on the same engine.',
      ],
    },
  },
  {
    id: 'accuracy',
    group: 'simulator',
    question: {
      es: '¿El simulador se comporta igual que un PLC real?',
      en: 'Does the simulator behave like a real PLC?',
    },
    answer: {
      es: [
        'Imita el funcionamiento esencial: ciclo de scan, imagen de proceso, temporizadores y contadores según IEC 61131-3, forzados y watchdog. El tiempo es simulado, con un ciclo fijo de 10 ms.',
        'Cada marca tiene detalles propios (tiempos de ciclo, instrucciones especiales, manejo de errores) que no reproducimos. Para un proyecto real, consulta siempre el manual del equipo.',
      ],
      en: [
        'It imitates the essentials: scan cycle, process image, IEC 61131-3 timers and counters, forcing and watchdog. Time is simulated, with a fixed 10 ms cycle.',
        'Each brand has its own details (cycle times, special instructions, error handling) that we do not reproduce. For a real project, always check the device manual.',
      ],
    },
  },
  {
    id: 'address-styles',
    group: 'simulator',
    question: {
      es: '¿Puedo ver las direcciones como en Siemens, Allen-Bradley u otra marca?',
      en: 'Can I see addresses as in Siemens, Allen-Bradley or another brand?',
    },
    answer: {
      es: [
        'Sí. En la barra de herramientas del simulador, el selector «Direcciones» muestra el mismo programa con la notación de Siemens, Allen-Bradley, Mitsubishi u Omron. Es solo una vista: el programa no cambia.',
      ],
      en: [
        'Yes. In the simulator toolbar, the “Addresses” selector shows the same program in Siemens, Allen-Bradley, Mitsubishi or Omron notation. It is only a view: the program does not change.',
      ],
    },
  },
  {
    id: 'start',
    group: 'learning',
    question: {
      es: 'Nunca he visto un PLC. ¿Por dónde empiezo?',
      en: 'I have never seen a PLC. Where do I start?',
    },
    answer: {
      es: [
        'Lee los temas de «Aprender» en orden, empezando por «¿Qué es un PLC?». Después abre el ejemplo de la ampolleta en el simulador y sigue con los desafíos: están ordenados por dificultad.',
      ],
      en: [
        'Read the “Learn” topics in order, starting with “What is a PLC?”. Then open the lamp example in the simulator and move on to the challenges: they are ordered by difficulty.',
      ],
    },
  },
  {
    id: 'electricity',
    group: 'learning',
    question: { es: '¿Necesito saber electricidad?', en: 'Do I need to know electricity?' },
    answer: {
      es: [
        'Para programar en el simulador, no: basta con lógica básica. Para trabajar con PLC reales, sí necesitas conocimientos de electricidad y de seguridad eléctrica; el trabajo en tableros debe hacerlo personal calificado.',
      ],
      en: [
        'To program in the simulator, no: basic logic is enough. To work with real PLCs, you do need electrical and electrical-safety knowledge; work on panels must be done by qualified personnel.',
      ],
    },
  },
  {
    id: 'which-brand',
    group: 'learning',
    question: { es: '¿Qué marca de PLC conviene aprender?', en: 'Which PLC brand should I learn?' },
    answer: {
      es: [
        'La que más se use en tu zona o en la industria donde quieres trabajar. Los conceptos son los mismos en todas, así que lo que aprendas aquí te servirá con cualquiera.',
        'En la sección «Marcas y software» comparamos las principales y cuáles tienen software gratuito para practicar.',
      ],
      en: [
        'Whichever is most used in your area or in the industry where you want to work. The concepts are the same in all of them, so what you learn here will help with any brand.',
        'In the “Brands and software” section we compare the main ones and which have free software to practise with.',
      ],
    },
  },
  {
    id: 'certificate',
    group: 'learning',
    question: { es: '¿Entregan certificados?', en: 'Do you give certificates?' },
    answer: {
      es: ['No por ahora. El objetivo es que aprendas y practiques gratis.'],
      en: ['Not for now. The goal is for you to learn and practise for free.'],
    },
  },
];
