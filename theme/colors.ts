export const colors = {
  brand: {
    50:  '#EAF2FB',
    100: '#C9DEF4',
    200: '#A5C8FF',
    300: '#6AAEE0',
    500: '#1F6FBF',
    600: '#1A5FA6',
    700: '#124577',
    900: '#0B2F52',
  },
  accent: {
    100: '#D6F2EC',
    500: '#0FA896',
    700: '#0A6E64',
  },
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
  dark: {
    bg:       '#07090F',
    surface:  '#0D1117',
    card:     '#111827',
    elevated: '#161E2E',
    border:   '#1E2A3A',
    text:     '#E2E8F0',
    subtext:  '#7A8FA8',
  },
  severity: {
    low:      '#2E9E5B',
    moderate: '#F4B400',
    high:     '#EA6A0C',
    critical: '#D32F2F',
  },
  status: {
    pending:  { bg: '#FCF1DC', text: '#8A5A00' },
    verified: { bg: '#E7F0FB', text: '#124577' },
    assigned: { bg: '#DCF3F0', text: '#0A6E64' },
    resolved: { bg: '#DCFCE7', text: '#166534' },
    rejected: { bg: '#FEE2E2', text: '#B91C1C' },
  },
  heatmap: ['#3B82C4', '#2E9E5B', '#F4B400', '#EA6A0C', '#D32F2F'],
  floodDepth: {
    gradient: ['#E3F2FD', '#90CAF9', '#42A5F5', '#1565C0', '#0D47A1'],
    low:      { fill: 'rgba(144,202,249,0.25)', stroke: 'rgba(144,202,249,0.6)' },
    moderate: { fill: 'rgba(66,165,245,0.30)',  stroke: 'rgba(66,165,245,0.65)' },
    high:     { fill: 'rgba(21,101,192,0.35)',  stroke: 'rgba(21,101,192,0.7)' },
    critical: { fill: 'rgba(13,71,161,0.40)',   stroke: 'rgba(13,71,161,0.75)' },
  },
  white: '#FFFFFF',

  // Auth/form colors (login & signup screens)
  auth: {
    primary:         '#5A6FF5',
    heading:         '#1A202C',
    muted:           '#A0AEC0',
    tertiary:        '#718096',
    placeholder:     '#CBD5E0',
    inputBg:         '#F7F8FC',
    inputIconBg:     '#EDF0F7',
    inputIconActive: '#EBF0FF',
    pageBg:          '#FAFBFE',
    bodyText:        '#2D3748',
  },

  // Gradient tuples for LinearGradient
  gradients: {
    hero:        ['#00D2FF', '#4A6CF7', '#7C3AED'] as const,
    wave:        ['#6B52F5', '#7C3AED'] as const,
    cta:         ['#4A6CF7', '#7C3AED'] as const,
    ctaDisabled: ['#8B9CF7', '#A78BFA'] as const,
    password:    ['#A855F7', '#6366F1'] as const,
  },

  // Form feedback colors
  feedback: {
    error:          '#E53E3E',
    errorBg:        '#FFF5F5',
    errorBorder:    '#FED7D7',
    success:        '#48BB78',
    strongPassword: '#66BB6A',
    passwordMedium: '#F6AD55',
    advisory:       '#D97706',
  },

  // Social auth brand colors
  social: {
    google:   '#4285F4',
    facebook: '#1877F2',
  },

  // Icon accent palette
  iconAccents: {
    blue:   '#4F8EF7',
    purple: '#A855F7',
    green:  '#10B981',
    amber:  '#F59E0B',
    indigo: '#6366F1',
    sky:    '#0EA5E9',
    admin:  '#8B5CF6',
    online: '#34D399',
  },

  // Road hazard colors
  roadHazard: {
    closedRoad:   '#D32F2F',
    debris:       '#E65100',
    landslide:    '#6D4C41',
    impassable:   '#B71C1C',
    slowDown:     '#F9A825',
    gradient: ['#F9A825', '#E65100', '#D32F2F', '#B71C1C'],
  },

  // Flood hazard icon palette (map legend specific)
  floodHazard: {
    flashFlood:   '#0D47A1',
    riverFlood:   '#1565C0',
    coastalFlood: '#0277BD',
    urbanFlood:   '#42A5F5',
    gradient: ['#42A5F5', '#1565C0', '#0D47A1'],
  },

  // Evacuation center color
  evac: '#0E9E6E',

  // Responder colors
  responder: {
    locationCardBg: '#D6EAF8',
    resolveCardBg:  '#E8F8F5',
    activeCardBg:   '#EBF5FB',
    pageBg:         '#F2F4F7',
    cardBorder:     '#E8ECF0',

    // Dark blue mode palette
    dark: {
      bg:         '#0A1628',
      surface:    '#0D1D30',
      card:       '#0F2035',
      elevated:   '#152A42',
      border:     '#1C3355',
      text:       '#E8EDF5',
      subtext:    '#7B93B0',
      muted:      '#5A7291',
      accent:     '#60A5FA',
      accentDim:  '#3B82F6',
      success:    '#34D399',
      warning:    '#FBBF24',
      danger:     '#F87171',
    },
  },

  // Overlay & glass tokens
  overlay: {
    backdrop:           'rgba(4,7,14,0.72)',
    modalDark:          'rgba(0,0,0,0.55)',
    modalLight:         'rgba(0,0,0,0.4)',
    scrim:              'rgba(0,0,0,0.06)',
    whiteSubtle:        'rgba(255,255,255,0.04)',
    whiteFaint:         'rgba(255,255,255,0.05)',
    whiteThin:          'rgba(255,255,255,0.06)',
    whiteGhost:         'rgba(255,255,255,0.07)',
    whiteDim:           'rgba(255,255,255,0.08)',
    whiteLight:         'rgba(255,255,255,0.10)',
    whiteMedium:        'rgba(255,255,255,0.12)',
    whiteSoft:          'rgba(255,255,255,0.15)',
    whiteRegular:       'rgba(255,255,255,0.18)',
    whiteAccent:        'rgba(255,255,255,0.20)',
    whiteGlow:          'rgba(255,255,255,0.22)',
    whiteBright:        'rgba(255,255,255,0.25)',
    whiteFirm:          'rgba(255,255,255,0.30)',
    whiteStrong:        'rgba(255,255,255,0.35)',
    whiteBold:          'rgba(255,255,255,0.45)',
    whiteHalf:          'rgba(255,255,255,0.50)',
    whiteSub:           'rgba(255,255,255,0.55)',
    whiteMid:           'rgba(255,255,255,0.60)',
    whiteHigh:          'rgba(255,255,255,0.70)',
    whiteCard:          'rgba(255,255,255,0.85)',
    whiteNear:          'rgba(255,255,255,0.90)',
    whiteFull:          'rgba(255,255,255,0.92)',
    whitePanel:         'rgba(255,255,255,0.97)',
    heatmapCardDark:    'rgba(17,24,39,0.95)',
    heatmapCardLight:   'rgba(255,255,255,0.97)',
    heatmapBorderDark:  'rgba(255,255,255,0.08)',
    heatmapBorderLight: 'rgba(0,0,0,0.06)',
    darkDropdownBg:     'rgba(13,17,23,0.97)',
    darkDropdownCtrl:   'rgba(13,17,23,0.95)',
    brandGlass:         'rgba(79,142,247,0.18)',
    ctaShadow:          'rgba(74,108,247,0.10)',
  },

  // Light/dark mode UI tokens (for constants/theme.ts compatibility)
  ui: {
    light: {
      text:            '#11181C',
      background:      '#fff',
      tint:            '#1F6FBF',
      icon:            '#687076',
      tabIconDefault:  '#687076',
      tabIconSelected: '#1F6FBF',
    },
    dark: {
      text:            '#ECEDEE',
      background:      '#151718',
      tint:            '#fff',
      icon:            '#9BA1A6',
      tabIconDefault:  '#9BA1A6',
      tabIconSelected: '#fff',
    },
  },
};
