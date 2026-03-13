# Security Headers Guide

## Overview

The HR-ERP backend uses Helmet.js plus custom middleware to set security headers that protect against common web attacks.

## Headers Set

### Helmet.js Headers

| Header | Value | Purpose |
|---|---|---|
| **Content-Security-Policy** | Strict directives | Prevents XSS by controlling which resources can load |
| **X-Content-Type-Options** | `nosniff` | Prevents MIME type sniffing attacks |
| **X-Frame-Options** | `DENY` | Prevents clickjacking (page cannot be embedded in iframes) |
| **X-DNS-Prefetch-Control** | `off` | Prevents DNS prefetching which can leak browsing info |
| **Strict-Transport-Security** | `max-age=31536000; includeSubDomains` | Forces HTTPS connections (HSTS) |
| **Referrer-Policy** | `strict-origin-when-cross-origin` | Controls referrer information leakage |
| **X-Permitted-Cross-Domain-Policies** | `none` | Prevents Flash/PDF cross-domain requests |
| **Cross-Origin-Opener-Policy** | `same-origin` | Prevents Spectre-style side-channel attacks |
| **Cross-Origin-Resource-Policy** | `same-origin` | Prevents cross-origin resource reading |

### Custom Headers

| Header | Value | Purpose |
|---|---|---|
| **Permissions-Policy** | `camera=(), microphone=(), geolocation=(), interest-cohort=()` | Restricts browser feature access, opts out of FLoC |
| **Cache-Control** | `no-store, no-cache, must-revalidate, private` | Prevents caching of API responses (sensitive data) |
| **Pragma** | `no-cache` | HTTP/1.0 cache prevention |

### Header NOT Set

| Header | Reason |
|---|---|
| **X-XSS-Protection** | Disabled (`0`). Modern browsers use CSP instead; the old XSS filter can introduce vulnerabilities |

## Content Security Policy (CSP)

### Directives

| Directive | Value | Reason |
|---|---|---|
| `default-src` | `'self'` | Only allow resources from same origin |
| `script-src` | `'self'` | Scripts only from same origin |
| `style-src` | `'self' 'unsafe-inline'` | Styles from same origin + inline (needed for UI frameworks like MUI) |
| `img-src` | `'self' data: https:` | Images from same origin, data URIs, and HTTPS |
| `font-src` | `'self' https: data:` | Fonts from same origin, HTTPS, and data URIs |
| `connect-src` | `'self'` (+ `ws: wss:` in dev) | API connections; WebSocket added in development |
| `object-src` | `'none'` | Block Flash/plugins entirely |
| `frame-src` | `'none'` | Block all iframes |
| `frame-ancestors` | `'none'` | Prevent page from being framed |
| `form-action` | `'self'` | Forms can only submit to same origin |
| `base-uri` | `'self'` | Prevent base tag hijacking |

### Why `unsafe-inline` for Styles

UI frameworks like Material UI (MUI) and styled-components inject inline styles dynamically. Without `unsafe-inline` for `style-src`, the application UI would break. This is a known trade-off — inline styles are low risk compared to inline scripts.

### CSP Report-Only Mode

In development, CSP runs in **report-only mode** — violations are logged but not enforced. In production, violations are blocked.

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `SECURITY_HEADERS_ENABLED` | `true` | Set to `false` to disable all security headers |
| `CSP_REPORT_URI` | (none) | URL to receive CSP violation reports |

## CSP Violation Reports

If `CSP_REPORT_URI` is set, browsers will POST violation reports to that endpoint. The backend logs these at `POST /api/v1/csp-report`.

## Testing Headers

```bash
# Check headers on any endpoint
curl -I http://localhost:3000/health

# Verify specific header
curl -s -o /dev/null -D - http://localhost:3000/health | grep -i "x-frame-options"
```
