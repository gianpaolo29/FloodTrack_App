export const colors = {
  // Brand — deep water blue (primary actions, headers, links)
  brand: {
    50:  '#EAF2FB',
    100: '#C9DEF4',
    300: '#6AAEE0',
    500: '#1F6FBF',
    600: '#1A5FA6',
    700: '#124577',
    900: '#0B2F52',
  },
  // Accent — GIS teal (map controls, secondary buttons, responder UI)
  accent: {
    100: '#D6F2EC',
    500: '#0FA896',
    700: '#0A6E64',
  },
  // Neutrals — slate (text, surfaces, borders)
  slate: {
    50:  '#F7F9FB',
    100: '#EDF1F5',
    200: '#DDE3EA',
    300: '#C4CDD6',
    400: '#9AA6B2',
    500: '#6E7B89',
    600: '#5A6675',
    700: '#42505C',
    800: '#2B3542',
    900: '#1A222B',
  },
  // Premium dark palette — OLED-friendly deep blacks
  dark: {
    bg:       '#07090F',   // screen background
    surface:  '#0D1117',   // base surface
    card:     '#111827',   // card background
    elevated: '#161E2E',   // elevated cards, modals, sheets
    border:   '#1E2A3A',   // subtle borders/dividers
    text:     '#E2E8F0',   // primary text
    subtext:  '#7A8FA8',   // secondary text
  },
  // Severity — RESERVED for severity only; never use on generic UI
  severity: {
    low:      '#2E9E5B',
    moderate: '#F4B400',
    high:     '#EA6A0C',
    critical: '#D32F2F',
  },
  // Status badges — tinted bg + dark same-family text
  status: {
    pending:  { bg: '#FCF1DC', text: '#8A5A00' },
    verified: { bg: '#E7F0FB', text: '#124577' },
    assigned: { bg: '#DCF3F0', text: '#0A6E64' },
    resolved: { bg: '#E7F6EC', text: '#1B7A3D' },
    rejected: { bg: '#F2EFEF', text: '#5A6675' },
  },
  // GIS heatmap density ramp (sparse → hotspot)
  heatmap: ['#3B82C4', '#2E9E5B', '#F4B400', '#EA6A0C', '#D32F2F'],
  white: '#FFFFFF',
};
