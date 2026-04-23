import React, { useState, useCallback } from 'react';
import { Box, IconButton, Typography, Tooltip, CircularProgress } from '@mui/material';
import {
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  NavigateBefore as PrevIcon,
  NavigateNext as NextIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Worker — same version as pdfjs-dist, served by Vite from node_modules
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

export default function PdfViewer({ src, fileName, onDownload, toolbarColor = '#ccc' }) {
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const onDocumentLoad = useCallback(({ numPages: n }) => {
    setNumPages(n);
    setPageNumber(1);
    setLoading(false);
    setError(null);
  }, []);

  const onDocumentError = useCallback((err) => {
    // eslint-disable-next-line no-console
    console.error('PDF load error:', err);
    setError(err);
    setLoading(false);
  }, []);

  const download = () => {
    if (onDownload) return onDownload();
    const a = document.createElement('a');
    a.href = src;
    a.download = fileName || 'document.pdf';
    a.click();
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', bgcolor: '#1a1a1a' }}>
      {/* Toolbar */}
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1,
        px: 2, py: 1, borderBottom: '1px solid #333',
      }}>
        <Tooltip title="Előző oldal">
          <span>
            <IconButton size="small" onClick={() => setPageNumber(p => Math.max(1, p - 1))}
              disabled={pageNumber <= 1} sx={{ color: toolbarColor }}>
              <PrevIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Typography variant="body2" sx={{ color: toolbarColor, minWidth: 80, textAlign: 'center' }}>
          {numPages > 0 ? `${pageNumber} / ${numPages}` : '…'}
        </Typography>
        <Tooltip title="Következő oldal">
          <span>
            <IconButton size="small" onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}
              disabled={pageNumber >= numPages} sx={{ color: toolbarColor }}>
              <NextIcon />
            </IconButton>
          </span>
        </Tooltip>

        <Box sx={{ width: 1, height: 20, bgcolor: '#444', mx: 1 }} />

        <Tooltip title="Kicsinyítés">
          <span>
            <IconButton size="small" onClick={() => setZoom(z => Math.max(MIN_ZOOM, z - ZOOM_STEP))}
              disabled={zoom <= MIN_ZOOM} sx={{ color: toolbarColor }}>
              <ZoomOutIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Typography variant="body2" sx={{ color: toolbarColor, minWidth: 48, textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </Typography>
        <Tooltip title="Nagyítás">
          <span>
            <IconButton size="small" onClick={() => setZoom(z => Math.min(MAX_ZOOM, z + ZOOM_STEP))}
              disabled={zoom >= MAX_ZOOM} sx={{ color: toolbarColor }}>
              <ZoomInIcon />
            </IconButton>
          </span>
        </Tooltip>

        <Box sx={{ width: 1, height: 20, bgcolor: '#444', mx: 1 }} />

        <Tooltip title="Letöltés">
          <IconButton size="small" onClick={download} sx={{ color: '#4ade80' }}>
            <DownloadIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Page area */}
      <Box sx={{
        flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        overflow: 'auto', py: 2,
      }}>
        {error ? (
          <Typography sx={{ color: '#f87171', p: 3 }}>
            A PDF nem tölthető be. {fileName && <>({fileName})</>}
          </Typography>
        ) : (
          <Document
            file={src}
            onLoadSuccess={onDocumentLoad}
            onLoadError={onDocumentError}
            loading={
              <Box sx={{ display: 'flex', alignItems: 'center', color: '#ccc', gap: 1, mt: 4 }}>
                <CircularProgress size={18} sx={{ color: '#ccc' }} />
                <Typography variant="body2">PDF betöltése…</Typography>
              </Box>
            }
            error={null /* handled above */}
          >
            {!loading && (
              <Page
                pageNumber={pageNumber}
                scale={zoom}
                renderAnnotationLayer
                renderTextLayer
              />
            )}
          </Document>
        )}
      </Box>
    </Box>
  );
}
