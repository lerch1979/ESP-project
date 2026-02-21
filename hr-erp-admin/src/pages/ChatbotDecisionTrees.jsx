import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, TextField, Paper, Card, CardContent, CardActions, Chip, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, FormControl, InputLabel, Select, MenuItem,
  Switch, FormControlLabel, Collapse, Divider,
} from '@mui/material';
import { Add, Edit, Delete, AccountTree, ExpandMore, ExpandLess } from '@mui/icons-material';
import { chatbotAPI } from '../services/api';
import { toast } from 'react-toastify';

const NODE_TYPE_CONFIG = {
  root: { label: 'Gyökér', color: 'primary' },
  question: { label: 'Kérdés', color: 'warning' },
  option: { label: 'Opció', color: 'success' },
  answer: { label: 'Válasz', color: 'secondary' },
};

function buildNodeTree(nodes, parentId = null) {
  return nodes
    .filter(n => (n.parent_id || null) === parentId)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map(n => ({ ...n, children: buildNodeTree(nodes, n.id) }));
}

function NodeRenderer({ node, depth = 0, onEdit, onDelete, onAddChild }) {
  const [expanded, setExpanded] = useState(true);
  const config = NODE_TYPE_CONFIG[node.node_type] || NODE_TYPE_CONFIG.option;

  return (
    <Box sx={{ ml: depth * 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', py: 0.5, px: 1, borderRadius: 1, '&:hover': { bgcolor: 'action.hover' } }}>
        {node.children?.length > 0 && (
          <IconButton size="small" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
          </IconButton>
        )}
        {!node.children?.length && <Box sx={{ width: 34 }} />}
        <Chip label={config.label} size="small" color={config.color} sx={{ mr: 1, minWidth: 60 }} />
        <Typography variant="body2" sx={{ flex: 1 }}>{node.content}</Typography>
        <IconButton size="small" onClick={() => onAddChild(node)}><Add fontSize="small" /></IconButton>
        <IconButton size="small" onClick={() => onEdit(node)}><Edit fontSize="small" /></IconButton>
        <IconButton size="small" color="error" onClick={() => onDelete(node.id)}><Delete fontSize="small" /></IconButton>
      </Box>
      {expanded && node.children?.map(child => (
        <NodeRenderer key={child.id} node={child} depth={depth + 1}
          onEdit={onEdit} onDelete={onDelete} onAddChild={onAddChild} />
      ))}
    </Box>
  );
}

export default function ChatbotDecisionTrees() {
  const [trees, setTrees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTree, setSelectedTree] = useState(null);
  const [treeNodes, setTreeNodes] = useState([]);
  const [treeModalOpen, setTreeModalOpen] = useState(false);
  const [editingTree, setEditingTree] = useState(null);
  const [treeForm, setTreeForm] = useState({ name: '', description: '', trigger_keywords: '', is_active: true });
  const [nodeModalOpen, setNodeModalOpen] = useState(false);
  const [editingNode, setEditingNode] = useState(null);
  const [parentNodeForAdd, setParentNodeForAdd] = useState(null);
  const [nodeForm, setNodeForm] = useState({ content: '', node_type: 'option', sort_order: 0 });

  const fetchTrees = async () => {
    try {
      setLoading(true);
      const response = await chatbotAPI.getDecisionTrees();
      setTrees(response.data || []);
    } catch (error) {
      toast.error('Hiba a döntési fák betöltése közben');
    } finally {
      setLoading(false);
    }
  };

  const fetchTreeDetail = async (treeId) => {
    try {
      const response = await chatbotAPI.getDecisionTree(treeId);
      setTreeNodes(response.data?.nodes || []);
    } catch (error) {
      toast.error('Hiba a fa részleteinek betöltése közben');
    }
  };

  useEffect(() => { fetchTrees(); }, []);

  const handleSelectTree = (tree) => {
    if (selectedTree?.id === tree.id) {
      setSelectedTree(null);
      setTreeNodes([]);
    } else {
      setSelectedTree(tree);
      fetchTreeDetail(tree.id);
    }
  };

  // Tree CRUD
  const handleOpenTreeModal = (tree = null) => {
    if (tree) {
      setEditingTree(tree);
      setTreeForm({
        name: tree.name, description: tree.description || '',
        trigger_keywords: (tree.trigger_keywords || []).join(', '),
        is_active: tree.is_active !== false,
      });
    } else {
      setEditingTree(null);
      setTreeForm({ name: '', description: '', trigger_keywords: '', is_active: true });
    }
    setTreeModalOpen(true);
  };

  const handleSaveTree = async () => {
    try {
      const data = {
        name: treeForm.name,
        description: treeForm.description,
        trigger_keywords: treeForm.trigger_keywords.split(',').map(k => k.trim()).filter(Boolean),
        is_active: treeForm.is_active,
      };
      if (editingTree) {
        await chatbotAPI.updateDecisionTree(editingTree.id, data);
        toast.success('Döntési fa frissítve');
      } else {
        await chatbotAPI.createDecisionTree(data);
        toast.success('Döntési fa létrehozva');
      }
      setTreeModalOpen(false);
      fetchTrees();
    } catch (error) {
      toast.error('Hiba a mentés közben');
    }
  };

  const handleDeleteTree = async (id) => {
    if (!window.confirm('Biztosan törli ezt a döntési fát és minden csomópontját?')) return;
    try {
      await chatbotAPI.deleteDecisionTree(id);
      toast.success('Döntési fa törölve');
      if (selectedTree?.id === id) { setSelectedTree(null); setTreeNodes([]); }
      fetchTrees();
    } catch (error) {
      toast.error('Hiba a törlés közben');
    }
  };

  // Node CRUD
  const handleOpenNodeModal = (node = null, parent = null) => {
    if (node && !parent) {
      setEditingNode(node);
      setParentNodeForAdd(null);
      setNodeForm({ content: node.content, node_type: node.node_type, sort_order: node.sort_order || 0 });
    } else {
      setEditingNode(null);
      setParentNodeForAdd(parent);
      setNodeForm({ content: '', node_type: 'option', sort_order: 0 });
    }
    setNodeModalOpen(true);
  };

  const handleSaveNode = async () => {
    try {
      if (editingNode) {
        await chatbotAPI.updateDecisionNode(editingNode.id, {
          content: nodeForm.content, node_type: nodeForm.node_type, sort_order: parseInt(nodeForm.sort_order) || 0,
        });
        toast.success('Csomópont frissítve');
      } else {
        await chatbotAPI.createDecisionNode({
          tree_id: selectedTree.id,
          parent_id: parentNodeForAdd?.id || null,
          content: nodeForm.content,
          node_type: nodeForm.node_type,
          sort_order: parseInt(nodeForm.sort_order) || 0,
        });
        toast.success('Csomópont létrehozva');
      }
      setNodeModalOpen(false);
      fetchTreeDetail(selectedTree.id);
    } catch (error) {
      toast.error('Hiba a mentés közben');
    }
  };

  const handleDeleteNode = async (id) => {
    if (!window.confirm('Biztosan törli ezt a csomópontot és gyermekeit?')) return;
    try {
      await chatbotAPI.deleteDecisionNode(id);
      toast.success('Csomópont törölve');
      fetchTreeDetail(selectedTree.id);
    } catch (error) {
      toast.error('Hiba a törlés közben');
    }
  };

  const nodeTree = buildNodeTree(treeNodes);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Döntési fák</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => handleOpenTreeModal()}>Új döntési fa</Button>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {trees.map((tree) => (
          <Card key={tree.id} variant="outlined" sx={{ borderColor: selectedTree?.id === tree.id ? 'primary.main' : undefined }}>
            <CardContent sx={{ cursor: 'pointer' }} onClick={() => handleSelectTree(tree)}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AccountTree color="primary" /> {tree.name}
                  </Typography>
                  {tree.description && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{tree.description}</Typography>}
                </Box>
                <Chip label={tree.is_active ? 'Aktív' : 'Inaktív'} size="small" color={tree.is_active ? 'success' : 'default'} />
              </Box>
              <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                {(tree.trigger_keywords || []).map((kw, i) => <Chip key={i} label={kw} size="small" variant="outlined" />)}
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  {tree.node_count || 0} csomópont | {tree.usage_count || 0} használat
                </Typography>
              </Box>
            </CardContent>
            <CardActions sx={{ justifyContent: 'flex-end', pt: 0 }}>
              <Button size="small" onClick={(e) => { e.stopPropagation(); handleOpenTreeModal(tree); }}>Szerkesztés</Button>
              <Button size="small" color="error" onClick={(e) => { e.stopPropagation(); handleDeleteTree(tree.id); }}>Törlés</Button>
            </CardActions>

            <Collapse in={selectedTree?.id === tree.id}>
              <Divider />
              <Box sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle2">Csomópontok</Typography>
                  <Button size="small" startIcon={<Add />}
                    onClick={() => handleOpenNodeModal(null, null)}>
                    Gyökér csomópont
                  </Button>
                </Box>
                {nodeTree.length > 0 ? (
                  nodeTree.map(node => (
                    <NodeRenderer key={node.id} node={node}
                      onEdit={(n) => handleOpenNodeModal(n)}
                      onDelete={handleDeleteNode}
                      onAddChild={(n) => handleOpenNodeModal(null, n)} />
                  ))
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                    Nincs csomópont. Hozzon létre egy gyökér csomópontot.
                  </Typography>
                )}
              </Box>
            </Collapse>
          </Card>
        ))}

        {trees.length === 0 && !loading && (
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <AccountTree sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography color="text.secondary">Nincs döntési fa. Hozzon létre egyet!</Typography>
          </Paper>
        )}
      </Box>

      {/* Tree Modal */}
      <Dialog open={treeModalOpen} onClose={() => setTreeModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingTree ? 'Döntési fa szerkesztése' : 'Új döntési fa'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField label="Név" required value={treeForm.name}
            onChange={(e) => setTreeForm(p => ({ ...p, name: e.target.value }))} />
          <TextField label="Leírás" multiline rows={2} value={treeForm.description}
            onChange={(e) => setTreeForm(p => ({ ...p, description: e.target.value }))} />
          <TextField label="Trigger kulcsszavak (vesszővel)" value={treeForm.trigger_keywords}
            onChange={(e) => setTreeForm(p => ({ ...p, trigger_keywords: e.target.value }))}
            helperText="Ezek a szavak aktiválják a döntési fát" />
          <FormControlLabel control={
            <Switch checked={treeForm.is_active} onChange={(e) => setTreeForm(p => ({ ...p, is_active: e.target.checked }))} />
          } label="Aktív" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTreeModalOpen(false)}>Mégse</Button>
          <Button variant="contained" onClick={handleSaveTree} disabled={!treeForm.name}>Mentés</Button>
        </DialogActions>
      </Dialog>

      {/* Node Modal */}
      <Dialog open={nodeModalOpen} onClose={() => setNodeModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingNode ? 'Csomópont szerkesztése' : 'Új csomópont'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField label="Tartalom" required multiline rows={2} value={nodeForm.content}
            onChange={(e) => setNodeForm(p => ({ ...p, content: e.target.value }))} />
          <FormControl fullWidth>
            <InputLabel>Típus</InputLabel>
            <Select value={nodeForm.node_type} label="Típus"
              onChange={(e) => setNodeForm(p => ({ ...p, node_type: e.target.value }))}>
              <MenuItem value="root">Gyökér</MenuItem>
              <MenuItem value="question">Kérdés</MenuItem>
              <MenuItem value="option">Opció</MenuItem>
              <MenuItem value="answer">Válasz</MenuItem>
            </Select>
          </FormControl>
          <TextField label="Sorrend" type="number" value={nodeForm.sort_order}
            onChange={(e) => setNodeForm(p => ({ ...p, sort_order: e.target.value }))} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNodeModalOpen(false)}>Mégse</Button>
          <Button variant="contained" onClick={handleSaveNode} disabled={!nodeForm.content}>Mentés</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
