/**
 * Glossary (spec 5.7): each entry has the term and its definition in both languages, plus an
 * optional Learn topic for "read more". The page sorts entries per language.
 */
import type { LearnSlug } from './learn';
import type { Locale } from './site';

export interface GlossaryEntry {
  id: string;
  term: Record<Locale, string>;
  definition: Record<Locale, string>;
  learn?: LearnSlug;
}

const e = (
  id: string,
  es: [string, string],
  en: [string, string],
  learn?: LearnSlug,
): GlossaryEntry => ({
  id,
  term: { es: es[0], en: en[0] },
  definition: { es: es[1], en: en[1] },
  ...(learn ? { learn } : {}),
});

export const GLOSSARY: readonly GlossaryEntry[] = [
  e(
    'plc',
    [
      'PLC (controlador lógico programable)',
      'Computador industrial que lee entradas, ejecuta un programa en ciclos y controla salidas para automatizar máquinas y procesos.',
    ],
    [
      'PLC (programmable logic controller)',
      'Industrial computer that reads inputs, runs a program in cycles and drives outputs to automate machines and processes.',
    ],
    'what-is-a-plc',
  ),
  e(
    'scan-cycle',
    [
      'Ciclo de scan',
      'Ciclo que el PLC repite sin parar: leer entradas, ejecutar el programa, escribir salidas y tareas internas.',
    ],
    [
      'Scan cycle',
      'Loop the PLC repeats endlessly: read inputs, execute the program, write outputs and housekeeping.',
    ],
    'how-a-plc-works',
  ),
  e(
    'scan-time',
    [
      'Tiempo de ciclo',
      'Duración de un ciclo de scan completo, normalmente de unos pocos milisegundos. Depende del tamaño del programa y de la CPU.',
    ],
    [
      'Scan time',
      'Duration of one complete scan cycle, usually a few milliseconds. It depends on the program size and the CPU.',
    ],
    'how-a-plc-works',
  ),
  e(
    'process-image',
    [
      'Imagen de proceso',
      'Copia en memoria del estado de entradas y salidas. El programa trabaja sobre esta copia, que se actualiza al inicio y al final de cada ciclo.',
    ],
    [
      'Process image',
      'In-memory copy of the input and output states. The program works on this copy, which is refreshed at the start and end of each cycle.',
    ],
    'how-a-plc-works',
  ),
  e(
    'watchdog',
    [
      'Watchdog (perro guardián)',
      'Vigilancia que detiene el PLC si un ciclo de scan tarda demasiado, por ejemplo por un bucle infinito.',
    ],
    [
      'Watchdog',
      'Supervision that stops the PLC if a scan cycle takes too long, for example because of an endless loop.',
    ],
    'how-a-plc-works',
  ),
  e(
    'cpu',
    [
      'CPU',
      'Unidad central del PLC: ejecuta el programa, gestiona la memoria y las comunicaciones.',
    ],
    ['CPU', 'The PLC central unit: it runs the program and manages memory and communications.'],
    'how-a-plc-works',
  ),
  e(
    'compact-plc',
    [
      'PLC compacto',
      'PLC con CPU, fuente y entradas y salidas en una sola caja. Suele admitir algunos módulos de expansión.',
    ],
    [
      'Compact PLC',
      'PLC with CPU, power supply and inputs and outputs in a single housing. It usually accepts a few expansion modules.',
    ],
    'plc-types',
  ),
  e(
    'modular-plc',
    [
      'PLC modular',
      'PLC formado por módulos independientes (CPU, fuente, E/S, comunicaciones) que se combinan según la aplicación.',
    ],
    [
      'Modular PLC',
      'PLC made of separate modules (CPU, power supply, I/O, communications) combined to suit the application.',
    ],
    'plc-types',
  ),
  e(
    'safety-plc',
    [
      'PLC de seguridad',
      'PLC certificado para funciones de seguridad, con diagnósticos y redundancia internos. Se usa para paros de emergencia, cortinas de luz y puertas.',
    ],
    [
      'Safety PLC',
      'PLC certified for safety functions, with internal diagnostics and redundancy. Used for emergency stops, light curtains and guard doors.',
    ],
    'plc-types',
  ),
  e(
    'pac',
    [
      'PAC',
      'Controlador de automatización programable: controlador de gama alta que combina funciones de PLC con capacidades de un computador.',
    ],
    [
      'PAC',
      'Programmable automation controller: high-end controller combining PLC functions with computer-like capabilities.',
    ],
    'plc-types',
  ),
  e(
    'programmable-relay',
    [
      'Relé programable',
      'Controlador pequeño y económico para automatizaciones simples, con pocas entradas y salidas.',
    ],
    [
      'Programmable relay',
      'Small, low-cost controller for simple automation, with few inputs and outputs.',
    ],
    'plc-types',
  ),
  e(
    'digital-input',
    [
      'Entrada digital',
      'Entrada con solo dos estados (0 o 1), como un botón o un sensor de proximidad.',
    ],
    [
      'Digital input',
      'Input with only two states (0 or 1), such as a push button or a proximity sensor.',
    ],
    'inputs-and-outputs',
  ),
  e(
    'analog-input',
    [
      'Entrada analógica',
      'Entrada que mide un valor continuo, como 0–10 V o 4–20 mA, y lo convierte en un número.',
    ],
    [
      'Analog input',
      'Input that measures a continuous value, such as 0–10 V or 4–20 mA, and converts it into a number.',
    ],
    'inputs-and-outputs',
  ),
  e(
    '4-20ma',
    [
      '4–20 mA',
      'Señal analógica de corriente estándar en instrumentación. El "cero vivo" de 4 mA permite detectar un cable cortado.',
    ],
    [
      '4–20 mA',
      'Standard analog current signal in instrumentation. The 4 mA "live zero" makes a broken wire detectable.',
    ],
    'inputs-and-outputs',
  ),
  e(
    'pnp',
    [
      'Sensor PNP',
      'Sensor cuya salida entrega +24 V al detectar (sourcing). Se conecta a entradas tipo sink, con el común a 0 V.',
    ],
    [
      'PNP sensor',
      'Sensor whose output delivers +24 V when it detects (sourcing). It connects to sink inputs, with the common at 0 V.',
    ],
    'inputs-and-outputs',
  ),
  e(
    'npn',
    [
      'Sensor NPN',
      'Sensor cuya salida conecta a 0 V al detectar (sinking). Se conecta a entradas tipo source, con el común a +24 V.',
    ],
    [
      'NPN sensor',
      'Sensor whose output connects to 0 V when it detects (sinking). It connects to source inputs, with the common at +24 V.',
    ],
    'inputs-and-outputs',
  ),
  e(
    'common',
    [
      'Común',
      'Borne compartido por un grupo de entradas o salidas que cierra el circuito de todo el grupo.',
    ],
    [
      'Common',
      'Terminal shared by a group of inputs or outputs that closes the circuit of the whole group.',
    ],
    'wiring',
  ),
  e(
    'relay-output',
    [
      'Salida a relé',
      'Salida con un contacto mecánico: conmuta AC o DC y aísla, pero es lenta y se desgasta.',
    ],
    [
      'Relay output',
      'Output with a mechanical contact: it switches AC or DC and isolates, but it is slow and wears out.',
    ],
    'inputs-and-outputs',
  ),
  e(
    'transistor-output',
    [
      'Salida a transistor',
      'Salida electrónica para DC: rápida y de larga vida, ideal para conmutación frecuente y pulsos.',
    ],
    [
      'Transistor output',
      'Electronic DC output: fast and long-lived, ideal for frequent switching and pulses.',
    ],
    'inputs-and-outputs',
  ),
  e(
    'contactor',
    [
      'Contactor',
      'Interruptor electromecánico de potencia, accionado por una bobina, que conecta cargas grandes como motores.',
    ],
    [
      'Contactor',
      'Electromechanical power switch, driven by a coil, that connects large loads such as motors.',
    ],
    'inputs-and-outputs',
  ),
  e(
    'overload-relay',
    [
      'Relé térmico',
      'Protección de un motor contra sobrecargas. Su contacto auxiliar NC avisa al circuito de control cuando se dispara.',
    ],
    [
      'Overload relay',
      'Motor protection against overload. Its NC auxiliary contact tells the control circuit when it trips.',
    ],
    'inputs-and-outputs',
  ),
  e(
    'no',
    [
      'Contacto NA (normalmente abierto)',
      'En un dispositivo, contacto abierto en reposo. En Ladder, contacto que conduce cuando su bit vale 1.',
    ],
    [
      'NO contact (normally open)',
      'On a device, a contact that is open at rest. In Ladder, a contact that passes power when its bit is 1.',
    ],
    'basic-instructions',
  ),
  e(
    'nc',
    [
      'Contacto NC (normalmente cerrado)',
      'En un dispositivo, contacto cerrado en reposo. En Ladder, contacto que conduce cuando su bit vale 0.',
    ],
    [
      'NC contact (normally closed)',
      'On a device, a contact that is closed at rest. In Ladder, a contact that passes power when its bit is 0.',
    ],
    'basic-instructions',
  ),
  e(
    'emergency-stop',
    [
      'Paro de emergencia',
      'Pulsador tipo hongo rojo sobre fondo amarillo que detiene la máquina por seguridad. Usa contactos NC y actúa a través de un circuito de seguridad.',
    ],
    [
      'Emergency stop',
      'Red mushroom push button on a yellow background that stops the machine for safety. It uses NC contacts and acts through a safety circuit.',
    ],
    'best-practices',
  ),
  e(
    'terminal-block',
    [
      'Bornera',
      'Bloque de conexión montado en riel DIN donde llega el cableado de terreno antes de ir al PLC.',
    ],
    [
      'Terminal block',
      'DIN-rail connection block where field wiring lands before going to the PLC.',
    ],
    'wiring',
  ),
  e(
    'din-rail',
    [
      'Riel DIN',
      'Riel metálico normalizado de 35 mm donde se montan PLC, borneras y otros equipos del tablero.',
    ],
    [
      'DIN rail',
      'Standard 35 mm metal rail on which PLCs, terminal blocks and other panel devices are mounted.',
    ],
    'wiring',
  ),
  e(
    'loto',
    [
      'Bloqueo y etiquetado (LOTO)',
      'Procedimiento que aísla, bloquea y señaliza una fuente de energía antes de intervenir un equipo.',
    ],
    [
      'Lockout/tagout (LOTO)',
      'Procedure that isolates, locks and tags an energy source before working on equipment.',
    ],
    'wiring',
  ),
  e(
    'rs485',
    [
      'RS-485',
      'Medio de comunicación serial en bus, diferencial y resistente al ruido, para varios equipos y distancias largas.',
    ],
    [
      'RS-485',
      'Differential, noise-resistant serial bus medium for several devices over long distances.',
    ],
    'ports-and-communications',
  ),
  e(
    'modbus',
    [
      'Modbus',
      'Protocolo de comunicación abierto y simple, en versiones RTU (serial) y TCP (Ethernet). Lo hablan casi todos los equipos industriales.',
    ],
    [
      'Modbus',
      'Simple open communication protocol, in RTU (serial) and TCP (Ethernet) versions. Almost every industrial device speaks it.',
    ],
    'ports-and-communications',
  ),
  e(
    'profinet',
    [
      'PROFINET',
      'Ethernet industrial impulsado por Siemens y la organización PI para E/S, variadores y control en tiempo real.',
    ],
    [
      'PROFINET',
      'Industrial Ethernet backed by Siemens and the PI organization for I/O, drives and real-time control.',
    ],
    'ports-and-communications',
  ),
  e(
    'ethernet-ip',
    [
      'EtherNet/IP',
      'Ethernet industrial impulsado por Rockwell Automation y la organización ODVA.',
    ],
    ['EtherNet/IP', 'Industrial Ethernet backed by Rockwell Automation and the ODVA organization.'],
    'ports-and-communications',
  ),
  e(
    'opc-ua',
    [
      'OPC UA',
      'Estándar independiente de la marca para intercambiar datos industriales de forma segura con SCADA, MES y sistemas de TI.',
    ],
    [
      'OPC UA',
      'Vendor-independent standard to exchange industrial data securely with SCADA, MES and IT systems.',
    ],
    'ports-and-communications',
  ),
  e(
    'hmi',
    [
      'HMI',
      'Interfaz humano-máquina: pantalla junto a la máquina para ver estados y alarmas y dar órdenes.',
    ],
    [
      'HMI',
      'Human-machine interface: screen next to the machine to see states and alarms and give commands.',
    ],
    'ports-and-communications',
  ),
  e(
    'scada',
    [
      'SCADA',
      'Sistema de supervisión y adquisición de datos de una planta completa: históricos, alarmas y salas de control.',
    ],
    [
      'SCADA',
      'Supervisory control and data acquisition system for a whole plant: history, alarms and control rooms.',
    ],
    'ports-and-communications',
  ),
  e(
    'vfd',
    [
      'Variador de frecuencia',
      'Equipo que controla la velocidad de un motor de inducción variando la frecuencia y la tensión que le entrega.',
    ],
    [
      'Variable frequency drive (VFD)',
      'Device that controls an induction motor speed by varying the frequency and voltage it supplies.',
    ],
    'inputs-and-outputs',
  ),
  e(
    'bit',
    ['Bit', 'Unidad mínima de memoria: vale 0 o 1.'],
    ['Bit', 'Smallest unit of memory: it is 0 or 1.'],
    'memory-and-addressing',
  ),
  e('byte', ['Byte', 'Grupo de 8 bits.'], ['Byte', 'Group of 8 bits.'], 'memory-and-addressing'),
  e(
    'word',
    [
      'Word (palabra)',
      'Grupo de 16 bits; guarda, por ejemplo, un entero INT o el valor de una entrada analógica.',
    ],
    ['Word', 'Group of 16 bits; it stores, for example, an INT or the value of an analog input.'],
    'memory-and-addressing',
  ),
  e(
    'marker',
    [
      'Marca interna',
      'Bit o número de la memoria del PLC que el programa usa como memoria propia, sin conexión con el exterior.',
    ],
    [
      'Internal marker',
      'Bit or number in PLC memory that the program uses as its own memory, not connected to the outside.',
    ],
    'memory-and-addressing',
  ),
  e(
    'tag',
    ['Tag (variable)', 'Nombre simbólico asociado a un dato del PLC, como MARCHA para I0.0.'],
    ['Tag (variable)', 'Symbolic name linked to a PLC data item, such as START for I0.0.'],
    'memory-and-addressing',
  ),
  e(
    'retentive',
    ['Memoria retentiva', 'Zona de memoria que conserva su valor aunque el PLC se apague.'],
    ['Retentive memory', 'Memory area that keeps its value when the PLC is powered off.'],
    'memory-and-addressing',
  ),
  e(
    'iec-61131-3',
    [
      'IEC 61131-3',
      'Norma internacional que define los lenguajes de programación de PLC: LD, FBD, SFC, ST e IL (este último eliminado en 2025).',
    ],
    [
      'IEC 61131-3',
      'International standard defining PLC programming languages: LD, FBD, SFC, ST and IL (the latter removed in 2025).',
    ],
    'iec-61131-3-languages',
  ),
  e(
    'ladder',
    [
      'Ladder (LD, diagrama de escalera)',
      'Lenguaje gráfico que imita un esquema eléctrico de relés con contactos y bobinas.',
    ],
    [
      'Ladder diagram (LD)',
      'Graphical language that imitates a relay wiring diagram with contacts and coils.',
    ],
    'iec-61131-3-languages',
  ),
  e(
    'rung',
    [
      'Peldaño',
      'Cada línea de un programa Ladder: condiciones a la izquierda y salidas a la derecha.',
    ],
    ['Rung', 'Each line of a Ladder program: conditions on the left, outputs on the right.'],
    'iec-61131-3-languages',
  ),
  e(
    'fbd',
    [
      'FBD (diagrama de bloques de funciones)',
      'Lenguaje gráfico de bloques unidos por líneas de señal.',
    ],
    ['FBD (function block diagram)', 'Graphical language of blocks joined by signal lines.'],
    'iec-61131-3-languages',
  ),
  e(
    'st',
    [
      'ST (texto estructurado)',
      'Lenguaje textual de alto nivel con IF, CASE, bucles y expresiones matemáticas.',
    ],
    [
      'ST (structured text)',
      'High-level textual language with IF, CASE, loops and maths expressions.',
    ],
    'iec-61131-3-languages',
  ),
  e(
    'sfc',
    [
      'SFC (diagrama funcional secuencial)',
      'Lenguaje gráfico que organiza un proceso en pasos y transiciones.',
    ],
    [
      'SFC (sequential function chart)',
      'Graphical language that organises a process into steps and transitions.',
    ],
    'iec-61131-3-languages',
  ),
  e(
    'coil',
    ['Bobina', 'Instrucción de salida en Ladder que escribe en un bit el resultado del peldaño.'],
    ['Coil', 'Ladder output instruction that writes the rung result to a bit.'],
    'basic-instructions',
  ),
  e(
    'set-reset',
    [
      'Set / Reset',
      'Bobinas que ponen un bit en 1 (set) o en 0 (reset) y lo dejan así: forman una memoria.',
    ],
    [
      'Set / Reset',
      'Coils that set a bit to 1 (set) or 0 (reset) and leave it there: they form a memory.',
    ],
    'basic-instructions',
  ),
  e(
    'seal-in',
    [
      'Autorretención',
      'Contacto de una salida en paralelo con su botón de marcha para mantenerla activa al soltarlo. También se le llama enclavamiento.',
    ],
    [
      'Seal-in (latch)',
      'Contact of an output in parallel with its start button to keep it on after release.',
    ],
    'basic-instructions',
  ),
  e(
    'interlock',
    [
      'Enclavamiento entre salidas',
      'Condición que impide que dos acciones incompatibles ocurran a la vez, como girar a la derecha y a la izquierda.',
    ],
    [
      'Interlock',
      'Condition that prevents two incompatible actions from happening at the same time, such as running forward and reverse.',
    ],
    'basic-instructions',
  ),
  e(
    'edge',
    [
      'Flanco',
      'Detección del cambio de una señal: de 0 a 1 (positivo) o de 1 a 0 (negativo). Dura un solo ciclo de scan.',
    ],
    [
      'Edge',
      'Detection of a signal change: 0 to 1 (rising) or 1 to 0 (falling). It lasts a single scan cycle.',
    ],
    'basic-instructions',
  ),
  e(
    'ton',
    [
      'TON (retardo a la conexión)',
      'Temporizador cuya salida se activa cuando su entrada lleva el tiempo PT activa.',
    ],
    [
      'TON (on-delay timer)',
      'Timer whose output turns on after its input has been on for time PT.',
    ],
    'basic-instructions',
  ),
  e(
    'tof',
    [
      'TOF (retardo a la desconexión)',
      'Temporizador cuya salida sigue activa durante PT después de que cae su entrada.',
    ],
    ['TOF (off-delay timer)', 'Timer whose output stays on for PT after its input drops.'],
    'basic-instructions',
  ),
  e(
    'tp',
    ['TP (pulso)', 'Temporizador que entrega un pulso de duración PT al activarse su entrada.'],
    ['TP (pulse timer)', 'Timer that gives a pulse of duration PT when its input turns on.'],
    'basic-instructions',
  ),
  e(
    'ctu',
    [
      'CTU (contador ascendente)',
      'Contador que suma 1 en cada flanco de subida y activa su salida al llegar al valor PV.',
    ],
    [
      'CTU (up counter)',
      'Counter that adds 1 on each rising edge and turns its output on when it reaches PV.',
    ],
    'basic-instructions',
  ),
  e(
    'forcing',
    [
      'Forzado',
      'Fijar manualmente el valor de una entrada o salida, ignorando el programa o el cableado. Útil para pruebas, peligroso si se olvida.',
    ],
    [
      'Forcing',
      'Manually fixing the value of an input or output, overriding the program or the wiring. Useful for testing, dangerous if forgotten.',
    ],
    'best-practices',
  ),
  e(
    'online-change',
    [
      'Cambio en línea',
      'Modificación del programa mientras el PLC está en RUN, sin detener la máquina.',
    ],
    ['Online change', 'Editing the program while the PLC is in RUN, without stopping the machine.'],
    'best-practices',
  ),
  e(
    'fail-safe',
    [
      'A prueba de fallas',
      'Diseño en que una falla (cable cortado, falta de energía) lleva la máquina a un estado seguro.',
    ],
    [
      'Fail-safe',
      'Design in which a fault (broken wire, power loss) brings the machine to a safe state.',
    ],
    'best-practices',
  ),
  e(
    'codesys',
    [
      'CODESYS',
      'Entorno de programación IEC 61131-3 de una empresa independiente, usado como base por muchos fabricantes de PLC.',
    ],
    [
      'CODESYS',
      'IEC 61131-3 programming environment from an independent company, used as a base by many PLC manufacturers.',
    ],
  ),
];
