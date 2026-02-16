import React from 'react';
import { TableContainer } from '@mui/material';

function ResponsiveTable({ children, sx, ...props }) {
  return (
    <TableContainer
      sx={{
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        '& table': {
          minWidth: 650,
        },
        '& thead th:first-of-type, & tbody td:first-of-type': {
          position: 'sticky',
          left: 0,
          bgcolor: 'inherit',
          zIndex: 1,
        },
        '& thead th:first-of-type': {
          zIndex: 2,
          bgcolor: '#fff',
        },
        '& thead th': {
          whiteSpace: 'nowrap',
        },
        ...sx,
      }}
      {...props}
    >
      {children}
    </TableContainer>
  );
}

export default ResponsiveTable;
