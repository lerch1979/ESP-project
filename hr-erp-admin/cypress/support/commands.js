/**
 * Custom Cypress commands for HR-ERP Admin
 */

// Login via API (faster than UI login)
Cypress.Commands.add('loginAPI', (email = 'admin@hr-erp.com', password = 'password123') => {
  cy.request({
    method: 'POST',
    url: `${Cypress.env('API_URL') || 'http://localhost:3001'}/api/v1/auth/login`,
    body: { email, password },
  }).then((res) => {
    window.localStorage.setItem('token', res.body.token);
    if (res.body.refreshToken) {
      window.localStorage.setItem('refreshToken', res.body.refreshToken);
    }
    if (res.body.user) {
      window.localStorage.setItem('user', JSON.stringify(res.body.user));
    }
  });
});

// Login via UI
Cypress.Commands.add('login', (email, password) => {
  cy.session([email, password], () => {
    cy.visit('/login');
    cy.get('[data-cy=email-input], input[type="email"], input[name="email"]').type(email);
    cy.get('[data-cy=password-input], input[type="password"], input[name="password"]').type(password);
    cy.get('[data-cy=login-button], button[type="submit"]').click();
    cy.url().should('not.include', '/login');
  });
});

// Logout
Cypress.Commands.add('logout', () => {
  window.localStorage.removeItem('token');
  window.localStorage.removeItem('refreshToken');
  window.localStorage.removeItem('user');
  cy.visit('/login');
});

// API request with auth
Cypress.Commands.add('apiRequest', (method, url, body) => {
  const token = window.localStorage.getItem('token');
  return cy.request({
    method,
    url: `${Cypress.env('API_URL') || 'http://localhost:3001'}${url}`,
    body,
    headers: {
      Authorization: `Bearer ${token}`,
    },
    failOnStatusCode: false,
  });
});
