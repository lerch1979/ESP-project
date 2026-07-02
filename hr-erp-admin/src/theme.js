import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  // Brand palette — deep gold primary, lighter gold accent, brand black for dark
  // surfaces (matches the mobile app + logo). This recolors every MUI component
  // that uses color="primary"/"secondary" (buttons, chips, selected states).
  // Page-level HARDCODED colors are swept separately (theme phase 2).
  palette: {
    primary:   { main: '#8B6B33', light: '#BF9E69', dark: '#6f552a', contrastText: '#ffffff' },
    secondary: { main: '#BF9E69', light: '#d4bd90', dark: '#8B6B33', contrastText: '#1c1c1e' },
  },
  breakpoints: {
    values: {
      xs: 0,
      sm: 600,
      md: 768,
      lg: 1200,
      xl: 1536,
    },
  },
  components: {
    MuiDialog: {
      styleOverrides: {
        paper: ({ theme: t }) => ({
          [t.breakpoints.down('md')]: {
            margin: 0,
            width: '100% !important',
            maxWidth: '100% !important',
            height: '100%',
            maxHeight: '100%',
            borderRadius: 0,
          },
        }),
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: ({ theme: t }) => ({
          [t.breakpoints.down('md')]: {
            position: 'sticky',
            bottom: 0,
            backgroundColor: '#fff',
            borderTop: '1px solid #e0e0e0',
            padding: '12px 24px',
            zIndex: 1,
          },
        }),
      },
    },
    MuiButton: {
      styleOverrides: {
        root: ({ theme: t }) => ({
          [t.breakpoints.down('md')]: {
            minHeight: 44,
          },
        }),
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: ({ theme: t }) => ({
          [t.breakpoints.down('md')]: {
            minWidth: 44,
            minHeight: 44,
          },
        }),
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: ({ theme: t }) => ({
          [t.breakpoints.down('md')]: {
            padding: '8px 12px',
            fontSize: '0.8125rem',
          },
        }),
      },
    },
  },
});

export default theme;
