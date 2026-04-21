import React, { useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Typography, Button,
  Stack, TextField, ToggleButton, ToggleButtonGroup, Alert, Chip,
} from '@mui/material';
import {
  Payments as CashIcon, CreditCard as CardIcon, Gesture as SignIcon,
  Clear as ClearIcon, CheckCircle as ConfirmIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { inspectionsAPI } from '../../services/api';

/**
 * Mobile-friendly on-site payment capture. Large touch targets, simple
 * signature pad, immediate confirmation. Requires a non-empty signature.
 *
 * Props:
 *   open, onClose, resident (compensation_residents row), onSuccess
 */
export default function OnSitePaymentModal({ open, onClose, resident, onSuccess }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasStroke, setHasStroke] = useState(false);
  const [method, setMethod] = useState('on_site_cash');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  // Reset state whenever the dialog opens for a new resident.
  useEffect(() => {
    if (!open) return;
    setMethod('on_site_cash');
    setReceiptNumber('');
    setNotes('');
    setHasStroke(false);
    requestAnimationFrame(() => clearCanvas());
  }, [open, resident?.id]);

  const getCanvasContext = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    // Scale for high-DPI displays
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== rect.width * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111827';
    return ctx;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
  };

  const pos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const t = e.touches?.[0];
    const x = (t ? t.clientX : e.clientX) - rect.left;
    const y = (t ? t.clientY : e.clientY) - rect.top;
    return { x, y };
  };

  const start = (e) => {
    e.preventDefault();
    const ctx = getCanvasContext();
    if (!ctx) return;
    drawing.current = true;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setHasStroke(true);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = getCanvasContext();
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const end = () => { drawing.current = false; };

  const submit = async () => {
    if (!hasStroke) return toast.warn('Aláírás kötelező');
    const canvas = canvasRef.current;
    const signatureData = canvas.toDataURL('image/png');
    setBusy(true);
    try {
      const res = await inspectionsAPI.recordOnSitePayment(resident.id, {
        method,
        signature_data: signatureData,
        receipt_number: receiptNumber || null,
        notes: notes || null,
      });
      toast.success('Fizetés rögzítve');
      onSuccess?.(res?.data);
      onClose?.();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Fizetés rögzítése sikertelen');
    } finally { setBusy(false); }
  };

  if (!resident) return null;
  const outstanding = Number(resident.amount_assigned) - Number(resident.amount_paid || 0);

  return (
    <Dialog open={open} onClose={() => !busy && onClose?.()} fullWidth maxWidth="sm">
      <DialogTitle>
        Helyszíni fizetés
        <Typography variant="body2" color="text.secondary">
          {resident.resident_name}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>
          <Box sx={{ textAlign: 'center', py: 2, bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: 2 }}>
            <Typography variant="overline">Fizetendő</Typography>
            <Typography variant="h3" sx={{ fontWeight: 700 }}>
              {Number(outstanding).toLocaleString('hu-HU')} HUF
            </Typography>
          </Box>

          <Box>
            <Typography variant="subtitle2" gutterBottom>Fizetési mód</Typography>
            <ToggleButtonGroup
              exclusive fullWidth size="large"
              value={method}
              onChange={(_, v) => v && setMethod(v)}
              color="primary"
            >
              <ToggleButton value="on_site_cash" sx={{ py: 2 }}>
                <Stack alignItems="center"><CashIcon /><Typography>Készpénz</Typography></Stack>
              </ToggleButton>
              <ToggleButton value="on_site_card" sx={{ py: 2 }}>
                <Stack alignItems="center"><CardIcon /><Typography>Kártya</Typography></Stack>
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <TextField
            label={method === 'on_site_card' ? 'Nyugtaszám / terminál azonosító' : 'Nyugtaszám'}
            fullWidth value={receiptNumber}
            onChange={(e) => setReceiptNumber(e.target.value)}
          />

          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
              <Typography variant="subtitle2">
                <SignIcon sx={{ fontSize: 16, verticalAlign: 'middle', mr: 0.5 }} />
                Aláírás
              </Typography>
              <Button size="small" startIcon={<ClearIcon />} onClick={clearCanvas}>Törlés</Button>
            </Stack>
            <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper', touchAction: 'none' }}>
              <canvas
                ref={canvasRef}
                style={{ width: '100%', height: 150, display: 'block' }}
                onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
                onTouchStart={start} onTouchMove={move} onTouchEnd={end}
              />
            </Box>
            {!hasStroke && (
              <Alert severity="info" sx={{ mt: 1 }}>
                A lakó aláírása a fizetés elismerését jelenti.
              </Alert>
            )}
            {hasStroke && (
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Chip size="small" color="success" label="Aláírva" />
              </Stack>
            )}
          </Box>

          <TextField
            label="Jegyzet (opcionális)" fullWidth multiline rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose?.()} disabled={busy}>Mégsem</Button>
        <Button
          variant="contained" color="success" size="large"
          startIcon={<ConfirmIcon />}
          onClick={submit} disabled={busy || !hasStroke}
        >
          {busy ? 'Rögzítés…' : 'Fizetés átvéve'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
