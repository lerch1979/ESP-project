import { createTheme } from '@mui/material/styles';

const theme = createTheme({
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
