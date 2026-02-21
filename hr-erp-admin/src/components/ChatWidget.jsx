import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Fab, Paper, Grow } from '@mui/material';
import { SmartToy } from '@mui/icons-material';
import ChatWindow from './ChatWindow';

function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);

  const handleToggle = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (open) {
      setOpen(false);
    } else {
      setKey(prev => prev + 1);
      setOpen(true);
    }
  };

  const handleClose = () => {
    setOpen(false);
  };

  return createPortal(
    <>
      <Grow in={open} mountOnEnter unmountOnExit>
        <Paper
          elevation={8}
          onClick={(e) => e.stopPropagation()}
          sx={{
            position: 'fixed',
            bottom: 90,
            right: 24,
            width: { xs: 'calc(100% - 16px)', sm: 380 },
            height: 520,
            zIndex: 1300,
            borderRadius: 3,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <ChatWindow key={key} onClose={handleClose} />
        </Paper>
      </Grow>

      <Fab
        onClick={handleToggle}
        sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 1299,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          '&:hover': {
            background: 'linear-gradient(135deg, #5a6fd6 0%, #6a4292 100%)',
          },
          boxShadow: '0 4px 14px rgba(102,126,234,0.4)',
        }}
      >
        <SmartToy />
      </Fab>
    </>,
    document.body
  );
}

export default ChatWidget;
