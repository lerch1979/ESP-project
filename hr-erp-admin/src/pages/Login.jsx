import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { authAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';

function Login() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authAPI.login(email, password);

      if (response.success) {
        // Store in AuthContext (which also persists to localStorage)
        login(response.data.user, response.data.token, response.data.refreshToken);

        toast.success(t('loginSuccess'));
        navigate('/dashboard');
      } else {
        setError(response.message || t('loginError'));
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err.response?.data?.message || t('invalidCredentials'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}
    >
      <Container maxWidth="sm">
        <Paper elevation={10} sx={{ p: { xs: 3, sm: 4 }, borderRadius: 3 }}>
          <Box sx={{ textAlign: 'center', mb: { xs: 3, sm: 4 } }}>
            <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 900, color: '#2563eb', fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
              HOUSING SOLUTIONS
            </Typography>
            <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 2 }}>
              {t('nav.companySubtitle')}
            </Typography>
            <Typography variant="h6" color="text.secondary">
              {t('nav.portalSubtitle')}
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label={t('email')}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              margin="normal"
              required
              autoFocus
              disabled={loading}
            />

            <TextField
              fullWidth
              label={t('password')}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              margin="normal"
              required
              disabled={loading}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              sx={{
                mt: 3,
                py: 1.5,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #5a67d8 0%, #6b3fa0 100%)',
                },
              }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : t('login')}
            </Button>
          </form>

          <Box sx={{ mt: 3, p: 2, bgcolor: '#f5f5f5', borderRadius: 2 }}>
            <Typography variant="caption" display="block" gutterBottom sx={{ fontWeight: 600 }}>
              {t('testAccount')}:
            </Typography>
            <Typography variant="caption" display="block">
              Email: kiss.janos@abc-kft.hu
            </Typography>
            <Typography variant="caption" display="block">
              Jelszó: password123
            </Typography>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}

export default Login;
