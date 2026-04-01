// Blue professional color scheme for Backlog Synthesizer
// Applied via CSS variables in index.css and Ant Design ConfigProvider

export const theme = {
  // Blues
  blue900: '#0a1a3a',
  blue800: '#0d2b5e',
  blue700: '#0033A0',  // Primary
  blue400: '#3d8bfd',  // Accent
  blue100: '#e8f0fe',
  blue50: '#f4f7fc',

  // Neutrals
  white: '#ffffff',
  gray50: '#fafafa',
  gray100: '#f5f5f7',
  gray200: '#e8e8ed',
  gray400: '#9a9aad',
  gray600: '#5a5a6e',
  gray800: '#2d2d3a',
  gray900: '#1a1a2e',

  // Semantic
  success: '#52c41a',
  warning: '#faad14',
  error: '#ff4d4f',
  info: '#3d8bfd',
} as const;

// Status color mappings
export const statusColors: Record<string, string> = {
  // Stories
  generated: theme.gray400,
  under_review: theme.blue400,
  awaiting_confirmation: theme.blue700,
  confirmed: theme.success,
  rejected: theme.error,
  ready_to_push: theme.success,
  pending_decision: theme.warning,

  // Checks
  open: theme.warning,
  resolved: theme.success,
  dismissed: theme.gray400,

  // Meetings
  processing: theme.blue400,
  in_review: theme.warning,
  completed: theme.success,
};

export const confidenceColors: Record<string, string> = {
  high: theme.success,
  medium: theme.warning,
  low: theme.error,
};

export const groundingColors: Record<string, string> = {
  valid: theme.success,
  warning: theme.warning,
  invalid: theme.error,
};
