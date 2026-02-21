import React, { useState } from 'react';
import { Fab, Dialog, Slide } from '@mui/material';
import { SmartToy } from '@mui/icons-material';
import ChatWindow from './ChatWindow';

const SlideUp = React.forwardRef(function SlideUp(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

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

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        TransitionComponent={SlideUp}
        keepMounted={false}
        disableScrollLock
        hideBackdrop
        PaperProps={{
          sx: {
            position: 'fixed',
            bottom: 90,
            right: 24,
            m: 0,
            width: { xs: 'calc(100% - 16px)', sm: 380 },
            maxWidth: 'none',
            maxHeight: 'none',
            height: 520,
            borderRadius: 3,
            overflow: 'hidden',
          },
        }}
        sx={{
          '& .MuiDialog-container': {
            alignItems: 'flex-end',
            justifyContent: 'flex-end',
          },
        }}
      >
        <ChatWindow key={key} onClose={handleClose} />
      </Dialog>

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
    </>
  );
}

export default ChatWidget;
