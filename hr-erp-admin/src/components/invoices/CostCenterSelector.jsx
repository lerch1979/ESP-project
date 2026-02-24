import React, { useState, useRef, useMemo } from 'react';
import {
  Box, TextField, Popover, Typography, InputAdornment,
  IconButton, Collapse, Chip,
} from '@mui/material';
import {
  Search as SearchIcon, ChevronRight as ChevronRightIcon,
  ExpandMore as ExpandMoreIcon, AccountTree as TreeIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';

// Recursive tree node for the selector dropdown
function SelectorTreeNode({ node, level = 0, selectedId, onSelect, expandedIds, onToggle }) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;

  return (
    <>
      <Box
        onClick={() => onSelect(node)}
        sx={{
          display: 'flex', alignItems: 'center', py: 0.75, px: 1.5,
          pl: 1.5 + level * 2.5, cursor: 'pointer', borderRadius: 1,
          bgcolor: isSelected ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
          '&:hover': { bgcolor: isSelected ? 'rgba(37, 99, 235, 0.12)' : 'rgba(0,0,0,0.04)' },
          transition: 'all 0.15s',
        }}
      >
        {hasChildren ? (
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
            sx={{ mr: 0.5, p: 0.25 }}
          >
            {isExpanded ? <ExpandMoreIcon sx={{ fontSize: 18 }} /> : <ChevronRightIcon sx={{ fontSize: 18 }} />}
          </IconButton>
        ) : (
          <Box sx={{ width: 28, mr: 0.5 }} />
        )}
        <Typography sx={{ mr: 0.75, fontSize: '0.95rem' }}>{node.icon || '📁'}</Typography>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{
            fontWeight: isSelected ? 600 : 400, whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.85rem',
          }}>
            {node.name}
          </Typography>
          {node.code && (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>{node.code}</Typography>
          )}
        </Box>
        {!node.is_active && <Chip label="Inaktív" size="small" sx={{ height: 18, fontSize: '0.65rem' }} />}
      </Box>
      {hasChildren && (
        <Collapse in={isExpanded} timeout="auto">
          {node.children.map((child) => (
            <SelectorTreeNode
              key={child.id} node={child} level={level + 1}
              selectedId={selectedId} onSelect={onSelect}
              expandedIds={expandedIds} onToggle={onToggle}
            />
          ))}
        </Collapse>
      )}
    </>
  );
}

// Build breadcrumb path for a cost center
function getPathLabel(id, flatList) {
  if (!id || !flatList || flatList.length === 0) return '';

  const map = {};
  flatList.forEach((cc) => { map[cc.id] = cc; });

  const parts = [];
  let current = map[id];
  while (current) {
    parts.unshift(`${current.icon || '📁'} ${current.name}`);
    current = current.parent_id ? map[current.parent_id] : null;
  }
  return parts.join(' > ');
}

// Filter tree by search term
function filterTree(nodes, term) {
  if (!term) return nodes;
  const lower = term.toLowerCase();
  return nodes.reduce((acc, node) => {
    const match = node.name.toLowerCase().includes(lower) || (node.code && node.code.toLowerCase().includes(lower));
    const filteredChildren = node.children ? filterTree(node.children, term) : [];
    if (match || filteredChildren.length > 0) {
      acc.push({ ...node, children: filteredChildren.length > 0 ? filteredChildren : node.children });
    }
    return acc;
  }, []);
}

// Collect all node IDs recursively
function collectIds(nodes) {
  const ids = new Set();
  const walk = (list) => list.forEach((n) => { ids.add(n.id); if (n.children) walk(n.children); });
  walk(nodes);
  return ids;
}

export default function CostCenterSelector({
  value, onChange, costCenters = [], costCenterTree = [],
  label = 'Költséghely', required = false, error = false, size = 'small',
}) {
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState(new Set());

  const displayTree = useMemo(() => filterTree(costCenterTree, search), [costCenterTree, search]);

  // Auto-expand all when searching
  const effectiveExpanded = useMemo(() => {
    if (search) return collectIds(displayTree);
    return expandedIds;
  }, [search, displayTree, expandedIds]);

  const pathLabel = useMemo(() => getPathLabel(value, costCenters), [value, costCenters]);

  const handleToggle = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSelect = (node) => {
    onChange(node.id);
    setOpen(false);
    setSearch('');
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
  };

  return (
    <>
      <TextField
        ref={anchorRef}
        label={label + (required ? ' *' : '')}
        value={pathLabel}
        onClick={() => setOpen(true)}
        size={size}
        error={error}
        fullWidth
        InputProps={{
          readOnly: true,
          startAdornment: (
            <InputAdornment position="start">
              <TreeIcon fontSize="small" color="action" />
            </InputAdornment>
          ),
          endAdornment: value ? (
            <InputAdornment position="end">
              <IconButton size="small" onClick={handleClear}><ClearIcon fontSize="small" /></IconButton>
            </InputAdornment>
          ) : null,
          sx: { cursor: 'pointer', fontSize: '0.85rem' },
        }}
        inputProps={{ sx: { cursor: 'pointer' } }}
        placeholder="Válasszon költséghelyet..."
      />

      <Popover
        open={open}
        anchorEl={anchorRef.current}
        onClose={() => { setOpen(false); setSearch(''); }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { width: anchorRef.current?.offsetWidth || 400, maxHeight: 400 } } }}
      >
        <Box sx={{ p: 1.5, borderBottom: '1px solid #e5e7eb' }}>
          <TextField
            fullWidth size="small" placeholder="Keresés..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            autoFocus
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
            }}
          />
        </Box>
        <Box sx={{ overflow: 'auto', maxHeight: 320, py: 0.5 }}>
          {displayTree.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
              Nincs találat
            </Typography>
          ) : (
            displayTree.map((node) => (
              <SelectorTreeNode
                key={node.id} node={node} selectedId={value}
                onSelect={handleSelect} expandedIds={effectiveExpanded}
                onToggle={handleToggle}
              />
            ))
          )}
        </Box>
      </Popover>
    </>
  );
}
