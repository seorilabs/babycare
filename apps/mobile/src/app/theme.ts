export interface AppTheme {
  readonly dark: boolean;
  readonly colors: {
    readonly background: string;
    readonly surface: string;
    readonly surfaceMuted: string;
    readonly text: string;
    readonly textMuted: string;
    readonly border: string;
    readonly primary: string;
    readonly primarySoft: string;
    readonly feeding: string;
    readonly diaper: string;
    readonly sleep: string;
    readonly danger: string;
  };
}

export function createTheme(dark: boolean): AppTheme {
  return {
    dark,
    colors: dark
      ? {
          background: '#111817',
          surface: '#1B2523',
          surfaceMuted: '#24312F',
          text: '#F5FAF8',
          textMuted: '#AABAB6',
          border: '#30413D',
          primary: '#77C9B0',
          primarySoft: '#213D35',
          feeding: '#E8A87C',
          diaper: '#E3C36C',
          sleep: '#9186D9',
          danger: '#FF8A8A',
        }
      : {
          background: '#F5F8F6',
          surface: '#FFFFFF',
          surfaceMuted: '#EDF4F1',
          text: '#1C2925',
          textMuted: '#6A7D77',
          border: '#DBE7E2',
          primary: '#4D9F87',
          primarySoft: '#DFF1EB',
          feeding: '#D9824E',
          diaper: '#B58E22',
          sleep: '#7567C4',
          danger: '#C94B4B',
        },
  };
}
