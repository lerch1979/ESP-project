import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, Box, Grid, Chip, Alert, LinearProgress,
  Select, MenuItem, FormControl, InputLabel, Divider,
  Table, TableBody, TableRow, TableCell, IconButton, Tooltip,
  TextField, Stack, CircularProgress,
} from '@mui/material';
import {
  Close as CloseIcon,
  Send as SendIcon,
  Edit as EditIcon,
  Description as DescIcon,
  Receipt as InvoiceIcon,
  ReportProblem as DamageIcon,
  Assignment as ContractIcon,
  AccountBalance as TaxIcon,
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  History as HistoryIcon,
} from '@mui/icons-material';
import { emailInboxAPI } from '../../services/api';
import { toast } from 'react-toastify';

const DOCUMENT_TYPES = [
  { value: 'invoice', label: 'Számla', icon: <InvoiceIcon />, color: '#1976d2' },
  { value: 'damage_report', label: 'Kárbejelentés', icon: <DamageIcon />, color: '#d32f2f' },
  { value: 'employee_contract', label: 'Munkaszerződés', icon: <ContractIcon />, color: '#388e3c' },
  { value: 'service_contract', label: 'Szolgáltatási szerződés', icon: <ContractIcon />, color: '#7b1fa2' },
  { value: 'rental_contract', label: 'Bérleti szerződés', icon: <ContractIcon />, color: '#f57c00' },
  { value: 'tax_document', label: 'Adó dokumentum', icon: <TaxIcon />, color: '#455a64' },
  { value: 'payment_reminder', label: 'Fizetési felszólítás', icon: <WarningIcon />, color: '#e64a19' },
  { value: 'other', label: 'Egyéb', icon: <DescIcon />, color: '#757575' },
];

const STATUS_COLORS = {
  pending: '#f57c00',
  processed: '#388e3c',
  failed: '#d32f2f',
  needs_review: '#1976d2',
};

export default function DocumentReviewModal({ open, onClose, document, onUpdate }) {
  const [reclassifyType, setReclassifyType] = useState('');
  const [loading, setLoading] = useState(false);
  const [routingLog, setRoutingLog] = useState(null);
  const [ccNotes, setCcNotes] = useState('');
  const [savingCC, setSavingCC] = useState(false);

  // Keep local notes state in sync with the currently opened document
  useEffect(() => {
    setCcNotes(document?.notes || '');
  }, [document?.id, document?.notes]);

  if (!document) return null;

  const typeInfo = DOCUMENT_TYPES.find(t => t.value === document.documentType) || DOCUMENT_TYPES[7];

  const handleRoute = async () => {
    setLoading(true);
    try {
      await emailInboxAPI.route(document.id);
      toast.success('Dokumentum sikeresen továbbítva!');
      onUpdate?.();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Hiba a továbbításnál');
    } finally {
      setLoading(false);
    }
  };

  const handleReclassify = async () => {
    if (!reclassifyType) return;
    setLoading(true);
    try {
      await emailInboxAPI.reclassify(document.id, reclassifyType);
      toast.success('Dokumentum átsorolva!');
      setReclassifyType('');
      onUpdate?.();
    } catch (error) {
      toast.error('Hiba az átsorolásnál');
    } finally {
      setLoading(false);
    }
  };

  const loadRoutingLog = async () => {
    try {
      const res = await emailInboxAPI.getRoutingLog(document.id);
      setRoutingLog(res.data);
    } catch (e) {
      toast.error('Hiba a napló betöltésekor');
    }
  };

  const handleReclassifyCostCenter = async () => {
    setSavingCC(true);
    try {
      const result = await emailInboxAPI.reclassifyCostCenter(document.id, ccNotes);
      const code = result?.data?.classification?.cost_center_code || '—';
      toast.success('Költséghely frissítve: ' + code);
      onUpdate?.();
      onClose();
    } catch (e) {
      toast.error('Hiba az újraosztályozás során');
    } finally {
      setSavingCC(false);
    }
  };

  // NOTE: "Jóváhagyás" is a visual-only alias for "Újraosztályozás" — the
  // backend doesn't separately track admin approval for cost center
  // classifications, so both buttons call the same reclassify endpoint.
  const handleApproveCostCenter = handleReclassifyCostCenter;

  const renderExtractedData = () => {
    const data = document.extractedData;
    if (!data) return <Typography color="text.secondary">Nincs kinyert adat</Typography>;

    if (document.documentType === 'damage_report') {
      return (
        <Grid container spacing={2}>
          {data.roomNumber && (
            <Grid item xs={6}><Typography variant="body2" color="text.secondary">Szoba</Typography><Typography>{data.roomNumber}</Typography></Grid>
          )}
          {data.location && (
            <Grid item xs={6}><Typography variant="body2" color="text.secondary">Helyszín</Typography><Typography>{data.location}</Typography></Grid>
          )}
          {data.damageType && (
            <Grid item xs={6}><Typography variant="body2" color="text.secondary">Kár típusa</Typography><Typography>{data.damageType}</Typography></Grid>
          )}
          {data.urgency && (
            <Grid item xs={6}><Typography variant="body2" color="text.secondary">Sürgősség</Typography>
              <Chip label={data.urgency} size="small" color={data.urgency === 'critical' ? 'error' : data.urgency === 'high' ? 'warning' : 'default'} />
            </Grid>
          )}
          {data.issueDescription && (
            <Grid item xs={12}><Typography variant="body2" color="text.secondary">Leírás</Typography><Typography>{data.issueDescription}</Typography></Grid>
          )}
        </Grid>
      );
    }

    if (document.documentType === 'invoice') {
      return (
        <Grid container spacing={2}>
          {data.vendorName && <Grid item xs={6}><Typography variant="body2" color="text.secondary">Szállító</Typography><Typography>{data.vendorName}</Typography></Grid>}
          {data.invoiceNumber && <Grid item xs={6}><Typography variant="body2" color="text.secondary">Számlaszám</Typography><Typography>{data.invoiceNumber}</Typography></Grid>}
          {data.netAmount && <Grid item xs={4}><Typography variant="body2" color="text.secondary">Nettó</Typography><Typography fontWeight="bold">{Number(data.netAmount).toLocaleString('hu-HU')} Ft</Typography></Grid>}
          {data.vatAmount && <Grid item xs={4}><Typography variant="body2" color="text.secondary">ÁFA</Typography><Typography>{Number(data.vatAmount).toLocaleString('hu-HU')} Ft</Typography></Grid>}
          {data.grossAmount && <Grid item xs={4}><Typography variant="body2" color="text.secondary">Bruttó</Typography><Typography fontWeight="bold">{Number(data.grossAmount).toLocaleString('hu-HU')} Ft</Typography></Grid>}
        </Grid>
      );
    }

    if (['employee_contract', 'service_contract', 'rental_contract'].includes(document.documentType)) {
      return (
        <Grid container spacing={2}>
          {data.parties?.length > 0 && <Grid item xs={12}><Typography variant="body2" color="text.secondary">Felek</Typography><Typography>{data.parties.join(', ')}</Typography></Grid>}
          {data.startDate && <Grid item xs={6}><Typography variant="body2" color="text.secondary">Kezdő dátum</Typography><Typography>{data.startDate}</Typography></Grid>}
          {data.endDate && <Grid item xs={6}><Typography variant="body2" color="text.secondary">Lejárat</Typography><Typography>{data.endDate}</Typography></Grid>}
          {data.subject && <Grid item xs={12}><Typography variant="body2" color="text.secondary">Tárgy</Typography><Typography>{data.subject}</Typography></Grid>}
          {data.value && <Grid item xs={6}><Typography variant="body2" color="text.secondary">Érték</Typography><Typography>{data.value}</Typography></Grid>}
        </Grid>
      );
    }

    // Generic: show all key-value pairs
    return (
      <Box>
        {Object.entries(data).filter(([, v]) => v != null && v !== '').map(([key, value]) => (
          <Typography key={key} variant="body2" sx={{ mb: 0.5 }}>
            <strong>{key}:</strong> {typeof value === 'object' ? JSON.stringify(value) : String(value).substring(0, 200)}
          </Typography>
        ))}
      </Box>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ color: typeInfo.color }}>{typeInfo.icon}</Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6">{document.emailSubject || document.attachmentFilename}</Typography>
          <Typography variant="caption" color="text.secondary">
            {document.emailFrom} • {new Date(document.createdAt).toLocaleString('hu-HU')}
          </Typography>
        </Box>
        <Chip
          label={document.status}
          size="small"
          sx={{ bgcolor: STATUS_COLORS[document.status] || '#757575', color: '#fff' }}
        />
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {/* Classification */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>AI Besorolás</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
            <Chip
              icon={typeInfo.icon}
              label={typeInfo.label}
              sx={{ bgcolor: typeInfo.color, color: '#fff', '& .MuiChip-icon': { color: '#fff' } }}
            />
            <Box sx={{ flex: 1 }}>
              <LinearProgress
                variant="determinate"
                value={document.confidenceScore || 0}
                sx={{
                  height: 8, borderRadius: 4,
                  bgcolor: '#e0e0e0',
                  '& .MuiLinearProgress-bar': {
                    bgcolor: (document.confidenceScore || 0) >= 70 ? '#4caf50' : (document.confidenceScore || 0) >= 40 ? '#ff9800' : '#f44336',
                  },
                }}
              />
            </Box>
            <Typography variant="body2" fontWeight="bold">{document.confidenceScore || 0}%</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">{document.classificationReasoning}</Typography>
        </Box>

        {document.needsReview && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Alacsony bizonyosságú besorolás. Kérjük, ellenőrizze és szükség esetén sorolja át.
          </Alert>
        )}

        {document.status === 'failed' && (
          <Alert severity="error" sx={{ mb: 2 }}>
            A dokumentum feldolgozása sikertelen volt. Próbálja újra vagy sorolja át manuálisan.
          </Alert>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Extracted Data */}
        <Typography variant="subtitle2" gutterBottom>Kinyert adatok</Typography>
        <Box sx={{ mb: 3, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
          {renderExtractedData()}
        </Box>

        {/* Routing info */}
        {document.routedTo && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" gutterBottom>Továbbítva</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CheckIcon color="success" fontSize="small" />
              <Typography variant="body2">{document.routedTo} → {document.routedId}</Typography>
            </Box>
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Reclassify */}
        {document.status !== 'processed' && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>Manuális átsorolás</Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <FormControl size="small" sx={{ minWidth: 250 }}>
                <InputLabel>Dokumentum típus</InputLabel>
                <Select
                  value={reclassifyType}
                  label="Dokumentum típus"
                  onChange={(e) => setReclassifyType(e.target.value)}
                >
                  {DOCUMENT_TYPES.map(t => (
                    <MenuItem key={t.value} value={t.value}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ color: t.color, display: 'flex' }}>{t.icon}</Box>
                        {t.label}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button
                variant="outlined"
                onClick={handleReclassify}
                disabled={!reclassifyType || loading}
                startIcon={<EditIcon />}
              >
                Átsorolás
              </Button>
            </Box>
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Cost center classification */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>Költséghely besorolás</Typography>

          {/* A) Current classification display */}
          <Stack spacing={1.5} sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="body2" color="text.secondary" sx={{ minWidth: 160 }}>
                Jelenlegi költséghely:
              </Typography>
              {document.costCenterCode ? (
                <>
                  <Chip
                    label={document.costCenterCode}
                    size="small"
                    color={document.autoClassified ? 'default' : 'warning'}
                    sx={{ fontFamily: 'monospace', fontWeight: 600 }}
                  />
                  {document.costCenterName && (
                    <Typography variant="body2">{document.costCenterName}</Typography>
                  )}
                </>
              ) : (
                <Typography variant="body2" color="text.secondary">— Nincs beosztva</Typography>
              )}
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="body2" color="text.secondary" sx={{ minWidth: 160 }}>
                Besorolás indoka:
              </Typography>
              <Typography variant="body2" sx={{ flex: 1 }}>
                {document.classificationReason || '—'}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="body2" color="text.secondary" sx={{ minWidth: 160 }}>
                Státusz:
              </Typography>
              {document.needsReview ? (
                <Chip label="Review szükséges" size="small" color="warning" />
              ) : (document.autoClassified ? (
                <Chip label="Jóváhagyva" size="small" color="success" />
              ) : (
                <Typography variant="body2" color="text.secondary">—</Typography>
              ))}
            </Box>
          </Stack>

          {/* B) Notes field + reclassify */}
          <TextField
            label="Megjegyzés (település vagy egyéb azonosító)"
            multiline
            rows={2}
            fullWidth
            size="small"
            value={ccNotes}
            onChange={(e) => setCcNotes(e.target.value)}
            helperText={'Pl. „Beled szálló — 2026 március rezsi". A rendszer ebből keresi a település-szabályokat.'}
            sx={{ mb: 2 }}
          />

          {/* C) Action buttons */}
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Button
              variant="contained"
              color="primary"
              onClick={handleReclassifyCostCenter}
              disabled={savingCC}
              startIcon={savingCC ? <CircularProgress size={16} color="inherit" /> : <EditIcon />}
            >
              Újraosztályozás
            </Button>
            <Button
              variant="outlined"
              color="success"
              onClick={handleApproveCostCenter}
              disabled={savingCC}
              startIcon={<CheckIcon />}
            >
              Jóváhagyás
            </Button>
          </Stack>
        </Box>

        {/* Routing Log */}
        <Box sx={{ mt: 2 }}>
          <Button
            size="small"
            startIcon={<HistoryIcon />}
            onClick={loadRoutingLog}
          >
            Továbbítási napló
          </Button>
          {routingLog && (
            <Table size="small" sx={{ mt: 1 }}>
              <TableBody>
                {routingLog.length === 0 ? (
                  <TableRow><TableCell>Nincs napló bejegyzés</TableCell></TableRow>
                ) : routingLog.map(log => (
                  <TableRow key={log.id}>
                    <TableCell>{new Date(log.created_at).toLocaleString('hu-HU')}</TableCell>
                    <TableCell>{log.action_taken}</TableCell>
                    <TableCell>{log.target_table || '-'}</TableCell>
                    <TableCell>
                      {log.success
                        ? <CheckIcon color="success" fontSize="small" />
                        : <Tooltip title={log.error_message}><ErrorIcon color="error" fontSize="small" /></Tooltip>
                      }
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Bezárás</Button>
        {document.status !== 'processed' && (
          <Button
            variant="contained"
            onClick={handleRoute}
            disabled={loading}
            startIcon={<SendIcon />}
            color="primary"
          >
            Továbbítás
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
