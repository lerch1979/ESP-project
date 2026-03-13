# CSRF Protection Integration Guide

## Overview

The HR-ERP backend uses a **double-submit cookie pattern** for CSRF protection. This works alongside JWT Bearer token authentication — requests authenticated via JWT are automatically exempt from CSRF validation (since Bearer tokens in headers cannot be sent by cross-origin forms).

## When CSRF Protection Applies

| Authentication Method | CSRF Required? | Reason |
|---|---|---|
| JWT Bearer token | No | Headers can't be set by cross-origin forms |
| Cookie-based session | Yes | Cookies are sent automatically by browsers |
| No authentication | Yes (for POST/PUT/DELETE/PATCH) | Defense-in-depth |

## How It Works

1. The server sets a `_csrf` cookie (JavaScript-readable, `httpOnly: false`)
2. Your frontend reads this cookie and includes it in the `x-csrf-token` header
3. The server validates that the cookie and header values match

## Getting a CSRF Token

```http
GET /api/v1/csrf-token
```

Response:
```json
{
  "success": true,
  "csrfToken": "a1b2c3d4..."
}
```

The token is also set in the `_csrf` cookie.

## React Integration Example

### Axios Setup (Recommended)

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/api/v1',
  withCredentials: true, // Send cookies
});

// Read CSRF token from cookie and include in headers
api.interceptors.request.use((config) => {
  // Only needed for non-GET requests without JWT
  if (['post', 'put', 'delete', 'patch'].includes(config.method)) {
    const csrfToken = document.cookie
      .split('; ')
      .find(row => row.startsWith('_csrf='))
      ?.split('=')[1];

    if (csrfToken) {
      config.headers['x-csrf-token'] = csrfToken;
    }
  }
  return config;
});
```

### Fetch API Example

```javascript
async function postData(url, data) {
  const csrfToken = document.cookie
    .split('; ')
    .find(row => row.startsWith('_csrf='))
    ?.split('=')[1];

  return fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwtToken}`, // If using JWT, CSRF is skipped
      'x-csrf-token': csrfToken, // Include for non-JWT requests
    },
    body: JSON.stringify(data),
  });
}
```

### Important Notes

- If you authenticate via `Authorization: Bearer <token>`, CSRF protection is automatically skipped
- The `_csrf` cookie has `sameSite: 'strict'` — it won't be sent from cross-origin forms
- Token is valid for 24 hours
- Refresh the token by calling `GET /api/v1/csrf-token` if you get a 403 CSRF error

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `CSRF_ENABLED` | `true` | Set to `false` to disable CSRF protection |

## Error Response

When CSRF validation fails:
```json
{
  "success": false,
  "message": "Érvénytelen CSRF token. Kérjük frissítse az oldalt és próbálja újra.",
  "code": "CSRF_INVALID"
}
```
HTTP Status: `403 Forbidden`
