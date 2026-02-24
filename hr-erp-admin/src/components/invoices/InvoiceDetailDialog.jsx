import React from 'react';
import {
  Box, Typography, Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Chip, Link,
} from '@mui/material';
import {
  Receipt as ReceiptIcon, Download as DownloadIcon,
  PictureAsPdf as PdfIcon, Image as ImageIcon,
} from '@mui/icons-material';
import { UPLOADS_BASE_URL } from '../../services/api';

const PAYMENT_STATUSES = {
  pending: { label: 'Függőben', color: 'warning' },
  paid: { label: 'Fizetve', color: 'success' },
  overdue: { label: 'Lejárt', color: 'error' },
  cancelled: { label: 'Sztornó', color: 'default' },
};

const formatCurrency = (val, currency = 'HUF') => {
  if (!val && val !== 0) return '-';
  return new Intl.NumberFormat('hu-HU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(val);
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('hu-HU');
};

function Field({ label, value }) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 500 }} component="div">{value || '-'}</Typography>
    </Box>
  );
}

function FilePreview({ filePath }) {
  if (!filePath) return null;

  const fileUrl = `${UPLOADS_BASE_URL}/${filePath}`;
  const ext = filePath.split('.').pop().toLowerCase();
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
  const isPdf = ext === 'pdf';

  return (
    <Box sx={{ mt: 2, p: 2, bgcolor: '#f8fafc', borderRadius: 2 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>Csatolt fájl</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {isImage ? (
          <Box
            component="img"
            src={fileUrl}
            alt="Számla"
            sx={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 1, border: '1px solid #e5e7eb' }}
          />
        ) : (
          <Box sx={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#e5e7eb', borderRadius: 1 }}>
            {isPdf ? <PdfIcon color="error" /> : <ReceiptIcon color="action" />}
          </Box>
        )}
        <Box sx={{ flex: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>{filePath.split('/').pop()}</Typography>
          <Link href={fileUrl} target="_blank" rel="noopener" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
            <DownloadIcon fontSize="small" /> Letöltés / Megtekintés
          </Link>
        </Box>
      </Box>
    </Box>
  );
}

export default function InvoiceDetailDialog({ open, onClose, invoice }) {
  if (!invoice) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ReceiptIcon color="primary" />
          Számla: {invoice.invoice_number || 'N/A'}
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 1 }}>
          <Field label="Számlaszám" value={invoice.invoice_number} />
          <Field label="Számla dátum" value={formatDate(invoice.invoice_date)} />
          <Field label="Szállító neve" value={invoice.vendor_name} />
          <Field label="Szállító adószám" value={invoice.vendor_tax_number} />
          <Field label="Nettó összeg" value={formatCurrency(invoice.amount, invoice.currency)} />
          <Field label="ÁFA" value={formatCurrency(invoice.vat_amount, invoice.currency)} />
          <Field label="Bruttó összeg" value={
            <Typography variant="body1" sx={{ fontWeight: 700, color: '#2563eb' }}>
              {formatCurrency(invoice.total_amount, invoice.currency)}
            </Typography>
          } />
          <Field label="Pénznem" value={invoice.currency} />
          <Field label="Költséghely" value={
            <Chip label={`${invoice.cost_center_icon || '📁'} ${invoice.cost_center_name || '-'}`} size="small" variant="outlined" />
          } />
          <Field label="Kategória" value={
            invoice.category_name ? `${invoice.category_icon || ''} ${invoice.category_name}` : '-'
          } />
          <Field label="Fizetési státusz" value={
            <Chip
              label={PAYMENT_STATUSES[invoice.payment_status]?.label || invoice.payment_status}
              size="small"
              color={PAYMENT_STATUSES[invoice.payment_status]?.color || 'default'}
            />
          } />
          <Field label="Fizetési határidő" value={formatDate(invoice.due_date)} />
          <Field label="Fizetés dátuma" value={formatDate(invoice.payment_date)} />
          <Field label="Létrehozva" value={formatDate(invoice.created_at)} />
        </Box>
        {invoice.description && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary">Leírás</Typography>
            <Typography variant="body2">{invoice.description}</Typography>
          </Box>
        )}
        {invoice.notes && (
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="caption" color="text.secondary">Megjegyzések</Typography>
            <Typography variant="body2">{invoice.notes}</Typography>
          </Box>
        )}
        <FilePreview filePath={invoice.file_path} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Bezárás</Button>
      </DialogActions>
    </Dialog>
  );
}
