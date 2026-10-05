/**
 * "Brands and software" data (spec section 5.3). Reviewed against official sources on
 * BRANDS_REVIEWED; no prices, only qualitative licence levels. Brand names in text only (no logos).
 * Latin America presence and learning difficulty are qualitative editorial estimates.
 */
import type { Locale } from './site';

export const BRANDS_REVIEWED = '2026-10-05';

type Text = Record<Locale, string>;

/** free = free edition available; paid = paid licence; high = high-cost licence (large systems). */
export type Licence = 'free' | 'paid' | 'high';
export type Level = 'low' | 'medium' | 'high';
export type Scale = 'small' | 'medium' | 'large';

export interface SoftwareInfo {
  name: string;
  /** Which controllers it programs. */
  for: Text;
  licence: Licence;
  note?: Text;
}

export interface Brand {
  id: string;
  name: string;
  /** Families from small to large. */
  ranges: { name: string; scale: Scale }[];
  software: SoftwareInfo[];
  /** Typical address notation. */
  addressing: Text;
  sectors: Text;
  latam: Level;
  difficulty: Level;
  sources: { label: string; url: string }[];
}

export const BRANDS: readonly Brand[] = [
  {
    id: 'siemens',
    name: 'Siemens',
    ranges: [
      { name: 'LOGO!', scale: 'small' },
      { name: 'SIMATIC S7-1200 / S7-1200 G2', scale: 'small' },
      { name: 'SIMATIC S7-1500', scale: 'large' },
    ],
    software: [
      {
        name: 'LOGO! Soft Comfort',
        for: { es: 'LOGO!', en: 'LOGO!' },
        licence: 'paid',
        note: {
          es: 'Licencia de bajo costo; hay una versión demo para simular sin cargar al equipo.',
          en: 'Low-cost licence; a demo version simulates without downloading to the device.',
        },
      },
      {
        name: 'TIA Portal (STEP 7 Basic / Professional)',
        for: { es: 'S7-1200 y S7-1500', en: 'S7-1200 and S7-1500' },
        licence: 'high',
        note: {
          es: 'Prueba gratuita de 21 días. S7-1500 requiere la edición Professional.',
          en: '21-day free trial. S7-1500 requires the Professional edition.',
        },
      },
    ],
    addressing: {
      es: 'I0.0 / Q0.0 / M0.0 (en inglés). La versión en alemán usa E/A.',
      en: 'I0.0 / Q0.0 / M0.0 (English mnemonics). German mnemonics use E/A.',
    },
    sectors: {
      es: 'Manufactura, procesos, infraestructura y minería.',
      en: 'Manufacturing, process industries, infrastructure and mining.',
    },
    latam: 'high',
    difficulty: 'medium',
    sources: [
      { label: 'siemens.com — SIMATIC', url: 'https://www.siemens.com/en-us/products/simatic/' },
    ],
  },
  {
    id: 'rockwell',
    name: 'Allen-Bradley (Rockwell Automation)',
    ranges: [
      { name: 'Micro800', scale: 'small' },
      { name: 'CompactLogix', scale: 'medium' },
      { name: 'ControlLogix', scale: 'large' },
    ],
    software: [
      {
        name: 'Connected Components Workbench',
        for: { es: 'Micro800', en: 'Micro800' },
        licence: 'free',
        note: {
          es: 'La edición Standard es gratuita; la Developer es pagada.',
          en: 'The Standard edition is free; the Developer edition is paid.',
        },
      },
      {
        name: 'Studio 5000 Logix Designer',
        for: { es: 'CompactLogix y ControlLogix', en: 'CompactLogix and ControlLogix' },
        licence: 'high',
        note: {
          es: 'Varias ediciones (Mini, Lite, Standard, Full…); las menores no programan ControlLogix.',
          en: 'Several editions (Mini, Lite, Standard, Full…); the smaller ones do not program ControlLogix.',
        },
      },
    ],
    addressing: {
      es: 'Por tags (nombres de variables); las E/S se ven como Local:1:I.Data.0.',
      en: 'Tag based (variable names); I/O appears as Local:1:I.Data.0.',
    },
    sectors: {
      es: 'Minería, petróleo y gas, alimentos y manufactura; muy fuerte en América.',
      en: 'Mining, oil and gas, food and manufacturing; very strong in the Americas.',
    },
    latam: 'high',
    difficulty: 'high',
    sources: [
      {
        label: 'rockwellautomation.com — Design software',
        url: 'https://www.rockwellautomation.com/en-us/capabilities/industrial-automation-control/design-and-configuration-software.html',
      },
    ],
  },
  {
    id: 'schneider',
    name: 'Schneider Electric',
    ranges: [
      { name: 'Modicon M221', scale: 'small' },
      { name: 'Modicon M241 / M251 / M262', scale: 'medium' },
      { name: 'Modicon M340 / M580', scale: 'large' },
    ],
    software: [
      {
        name: 'EcoStruxure Machine Expert – Basic',
        for: { es: 'Modicon M221', en: 'Modicon M221' },
        licence: 'free',
      },
      {
        name: 'EcoStruxure Machine Expert',
        for: { es: 'M241, M251 y M262', en: 'M241, M251 and M262' },
        licence: 'paid',
        note: { es: 'Basado en CODESYS.', en: 'Based on CODESYS.' },
      },
      {
        name: 'EcoStruxure Control Expert',
        for: { es: 'M340 y M580', en: 'M340 and M580' },
        licence: 'high',
        note: { es: 'Antes llamado Unity Pro.', en: 'Formerly Unity Pro.' },
      },
    ],
    addressing: {
      es: 'Direcciones IEC: %I0.0 / %Q0.0 / %M0.',
      en: 'IEC addresses: %I0.0 / %Q0.0 / %M0.',
    },
    sectors: {
      es: 'Edificios, agua, energía y fabricantes de máquinas.',
      en: 'Buildings, water, energy and machine builders.',
    },
    latam: 'high',
    difficulty: 'medium',
    sources: [
      { label: 'se.com — Programming the M221', url: 'https://www.se.com/us/en/faqs/FA233597/' },
      {
        label: 'se.com — EcoStruxure Control Expert',
        url: 'https://www.se.com/us/en/product-range/548-ecostruxure-control-expert-software/',
      },
    ],
  },
  {
    id: 'mitsubishi',
    name: 'Mitsubishi Electric',
    ranges: [
      { name: 'MELSEC iQ-F (FX5)', scale: 'small' },
      { name: 'MELSEC L / Q', scale: 'medium' },
      { name: 'MELSEC iQ-R', scale: 'large' },
    ],
    software: [
      {
        name: 'GX Works3',
        for: { es: 'iQ-F (FX5) e iQ-R', en: 'iQ-F (FX5) and iQ-R' },
        licence: 'paid',
        note: { es: 'Existe una versión de prueba.', en: 'A trial version exists.' },
      },
      {
        name: 'GX Works2',
        for: { es: 'Series anteriores (FX3, L, Q)', en: 'Older series (FX3, L, Q)' },
        licence: 'paid',
      },
    ],
    addressing: {
      es: 'X0 / Y0 / M0 (las E/S X e Y se numeran en octal).',
      en: 'X0 / Y0 / M0 (X and Y I/O are numbered in octal).',
    },
    sectors: {
      es: 'Fabricantes de máquinas, embalaje y electrónica; muy fuerte en Asia.',
      en: 'Machine builders, packaging and electronics; very strong in Asia.',
    },
    latam: 'medium',
    difficulty: 'medium',
    sources: [
      {
        label: 'mitsubishielectric.com — Factory Automation',
        url: 'https://www.mitsubishielectric.com/fa/',
      },
    ],
  },
  {
    id: 'omron',
    name: 'Omron',
    ranges: [
      { name: 'CP1 / CP2E', scale: 'small' },
      { name: 'NX1P / CJ2', scale: 'medium' },
      { name: 'NJ / NX', scale: 'large' },
    ],
    software: [
      {
        name: 'CX-One (CX-Programmer)',
        for: { es: 'CP, CJ y CS', en: 'CP, CJ and CS' },
        licence: 'paid',
        note: { es: 'Prueba gratuita de 30 días.', en: '30-day free trial.' },
      },
      {
        name: 'Sysmac Studio',
        for: { es: 'NX y NJ', en: 'NX and NJ' },
        licence: 'paid',
        note: { es: 'Prueba gratuita de 30 días.', en: '30-day free trial.' },
      },
    ],
    addressing: {
      es: 'Áreas de memoria como 0.00 (entradas) y 100.00 (salidas) en CP/CJ; variables en NJ/NX.',
      en: 'Memory areas such as 0.00 (inputs) and 100.00 (outputs) on CP/CJ; variables on NJ/NX.',
    },
    sectors: {
      es: 'Embalaje, electrónica, alimentos; fuerte en visión y robótica.',
      en: 'Packaging, electronics, food; strong in vision and robotics.',
    },
    latam: 'medium',
    difficulty: 'medium',
    sources: [
      {
        label: 'industrial.omron.eu — CX-One',
        url: 'https://industrial.omron.eu/en/products/cx-one',
      },
    ],
  },
  {
    id: 'abb',
    name: 'ABB',
    ranges: [
      { name: 'AC500-eCo', scale: 'small' },
      { name: 'AC500', scale: 'large' },
    ],
    software: [
      {
        name: 'Automation Builder',
        for: { es: 'AC500', en: 'AC500' },
        licence: 'free',
        note: {
          es: 'Edición Basic gratuita; Standard y Premium son pagadas. Basado en CODESYS.',
          en: 'Free Basic edition; Standard and Premium are paid. Based on CODESYS.',
        },
      },
    ],
    addressing: {
      es: 'Variables y direcciones IEC (%IX0.0 / %QX0.0).',
      en: 'Variables and IEC addresses (%IX0.0 / %QX0.0).',
    },
    sectors: {
      es: 'Energía, agua, infraestructura e industrias de proceso.',
      en: 'Energy, water, infrastructure and process industries.',
    },
    latam: 'high',
    difficulty: 'medium',
    sources: [
      {
        label: 'abb.com — Automation Builder',
        url: 'https://www.abb.com/global/en/areas/motion/digital-tools/automation-builder',
      },
    ],
  },
  {
    id: 'delta',
    name: 'Delta Electronics',
    ranges: [
      { name: 'DVP', scale: 'small' },
      { name: 'AS', scale: 'medium' },
      { name: 'AH', scale: 'large' },
    ],
    software: [
      {
        name: 'ISPSoft',
        for: { es: 'DVP, AS y AH', en: 'DVP, AS and AH' },
        licence: 'free',
      },
      {
        name: 'DIADesigner',
        for: { es: 'Gamas más recientes', en: 'Newer ranges' },
        licence: 'free',
        note: { es: 'Descarga con registro.', en: 'Download after registering.' },
      },
    ],
    addressing: {
      es: 'X0 / Y0 / M0 en DVP; la serie AS usa X0.0 / Y0.0.',
      en: 'X0 / Y0 / M0 on DVP; the AS series uses X0.0 / Y0.0.',
    },
    sectors: {
      es: 'Máquinas pequeñas y medianas donde importa el costo.',
      en: 'Small and medium machines where cost matters.',
    },
    latam: 'medium',
    difficulty: 'low',
    sources: [{ label: 'diastudio.deltaww.com', url: 'https://diastudio.deltaww.com/' }],
  },
  {
    id: 'weg',
    name: 'WEG',
    ranges: [
      { name: 'PLC300', scale: 'small' },
      { name: 'PLC500', scale: 'medium' },
    ],
    software: [
      {
        name: 'WEG Programming Suite (WPS)',
        for: { es: 'PLC300 y variadores WEG', en: 'PLC300 and WEG drives' },
        licence: 'free',
      },
      {
        name: 'CODESYS',
        for: { es: 'PLC500', en: 'PLC500' },
        licence: 'free',
        note: {
          es: 'Se programa con CODESYS V3.5, cuyo entorno de desarrollo es gratuito.',
          en: 'Programmed with CODESYS V3.5, whose development system is free.',
        },
      },
    ],
    addressing: {
      es: 'Variables y direcciones IEC en PLC500 (CODESYS).',
      en: 'Variables and IEC addresses on PLC500 (CODESYS).',
    },
    sectors: {
      es: 'Motores, variadores y tableros; empresa brasileña muy presente en Latinoamérica.',
      en: 'Motors, drives and panels; a Brazilian company very present in Latin America.',
    },
    latam: 'high',
    difficulty: 'low',
    sources: [
      {
        label: 'weg.net — PLC500',
        url: 'https://www.weg.net/catalog/weg/BR/en/Industrial-Automation/Process-Control/Programmable-Logic-Controllers/PLC500-Programmable-Logic-Controller/PROGRAMMABLE-CONTROLLER-PLC500/p/16034585',
      },
    ],
  },
];

/** The best licence available for a brand (for filtering). */
export const bestLicence = (brand: Brand): Licence =>
  brand.software.some((s) => s.licence === 'free')
    ? 'free'
    : brand.software.some((s) => s.licence === 'paid')
      ? 'paid'
      : 'high';

export const CODESYS_SOURCE = {
  label: 'codesys.com — Development System',
  url: 'https://us.codesys.com/products/engineering/development-system/',
};
