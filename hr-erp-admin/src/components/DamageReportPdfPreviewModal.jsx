import React, { useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Tabs, Tab, Box, CircularProgress, Button, Stack,
} from '@mui/material';
import { Download as DownloadIcon, Close as CloseIcon } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { damageReportsAPI } from '../services/api';

/**
 * Preview a damage report PDF inline before downloading.
 *
 * Uses an iframe + blob URL — works in every browser without pulling in
 * pdfjs/react-pdf for what amounts to "show me the PDF". Each language
 * tab fetches lazily on first activation; the blobs are cached so
 * switching tabs is instant the second time.
 *
 * URL.createObjectURL allocations are revoked when the modal closes
 * to avoid leaking memory for long sessions.
 */
const LANGS = [
  { code: 'hu', label: '🇭🇺 Magyar' },
  { code: 'en', label: '🇬🇧 English' },
];

export default function DamageReportPdfPreviewModal({ open, reportId, onClose }) {
  const [tab, setTab] = useState(0);
  // Blob URL cache per language. null = not loaded yet, '' = loading.
  const [urls, setUrls] = useState({ hu: null, en: null });
  const [loadingLang, setLoadingLang] = useState(null);
  // Keep a list of created object URLs so we can revoke them on close.
  const createdUrlsRef = useRef([]);

  const lang = LANGS[tab].code;

  // Load on first activation of a language
  useEffect(() => {
    if (!open || !reportId) return;
    if (urls[lang]) return;
    let cancelled = false;
    (async () => {
      setLoadingLang(lang);
      try {
        const blob = await damageReportsAPI.downloadPDF(reportId, lang);
        if (cancelled) return;
        const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        createdUrlsRef.current.push(url);
        setUrls(prev => ({ ...prev, [lang]: url }));
      } catch {
        if (!cancelled) toast.error('PDF betöltése sikertelen');
      } finally {
        if (!cancelled) setLoadingLang(null);
      }
    })();
    return () => { cancelled = true; };
  }, [open, reportId, lang, urls]);

  // Cleanup blob URLs when the modal is closed
  useEffect(() => {
    if (open) return;
    for (const u of createdUrlsRef.current) URL.revokeObjectURL(u);
    createdUrlsRef.current = [];
    setUrls({ hu: null, en: null });
    setTab(0);
  }, [open]);

  const handleDownload = () => {
    const url = urls[lang];
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `karigeny-${reportId}-${lang}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>📄 Kárigény előnézet</Box>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          {LANGS.map(l => <Tab key={l.code} label={l.label} />)}
        </Tabs>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0, height: '75vh' }}>
        {loadingLang === lang || !urls[lang] ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Stack alignItems="center" spacing={2}>
              <CircularProgress />
              <Box>PDF generálás folyamatban…</Box>
            </Stack>
          </Box>
        ) : (
          <iframe
            key={lang}
            src={urls[lang]}
            title={`Damage report PDF (${lang})`}
            style={{ width: '100%', height: '100%', border: 0 }}
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button startIcon={<CloseIcon />} onClick={onClose}>Bezárás</Button>
        <Button
          variant="contained"
          startIcon={<DownloadIcon />}
          onClick={handleDownload}
          disabled={!urls[lang]}
          sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
        >
          Letöltés ({lang.toUpperCase()})
        </Button>
      </DialogActions>
    </Dialog>
  );
}
