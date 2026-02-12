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
import { authAPI } from '../services/api';
import { toast } from 'react-toastify';

function Login() {
  const navigate = useNavigate();
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
        // Token és user adatok mentése
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        
        toast.success('Sikeres bejelentkezés!');
        navigate('/dashboard');
      } else {
        setError(response.message || 'Bejelentkezési hiba');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err.response?.data?.message || 'Hibás email vagy jelszó');
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
        background: 'linear-gradient(135deg, #2c5f2d 0%, #1e3f1f 100%)',
      }}
    >
      <Container maxWidth="sm">
        <Paper elevation={10} sx={{ p: 4, borderRadius: 3 }}>
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 900, color: '#2c5f2d' }}>
              HOUSING SOLUTIONS
            </Typography>
            <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 2 }}>
              Assisted Living Specialist
            </Typography>
            <Typography variant="h6" color="text.secondary">
              Employee Support Portal
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
              label="Email cím"
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
              label="Jelszó"
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
                background: 'linear-gradient(135deg, #2c5f2d 0%, #1e3f1f 100%)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #234d24 0%, #152e16 100%)',
                },
              }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Bejelentkezés'}
            </Button>
          </form>

          <Box sx={{ mt: 3, p: 2, bgcolor: '#f5f5f5', borderRadius: 2 }}>
            <Typography variant="caption" display="block" gutterBottom sx={{ fontWeight: 600 }}>
              Teszt fiók:
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
