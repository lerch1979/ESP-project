describe('Authentication Flow', () => {
  beforeEach(() => {
    cy.visit('/login');
  });

  it('should display login page', () => {
    cy.get('input[type="email"], input[name="email"], [data-cy=email-input]').should('be.visible');
    cy.get('input[type="password"], input[name="password"], [data-cy=password-input]').should('be.visible');
    cy.get('button[type="submit"], [data-cy=login-button]').should('be.visible');
  });

  it('should login successfully with valid credentials', () => {
    cy.get('input[type="email"], input[name="email"]').type('admin@hr-erp.com');
    cy.get('input[type="password"], input[name="password"]').type('password123');
    cy.get('button[type="submit"]').click();

    cy.url().should('not.include', '/login');
    cy.url().should('include', '/dashboard');
  });

  it('should show error with invalid credentials', () => {
    cy.get('input[type="email"], input[name="email"]').type('wrong@email.com');
    cy.get('input[type="password"], input[name="password"]').type('wrongpassword');
    cy.get('button[type="submit"]').click();

    cy.get('.MuiAlert-root, [role="alert"], .error-message').should('be.visible');
  });

  it('should redirect to login if not authenticated', () => {
    cy.clearLocalStorage();
    cy.visit('/dashboard');
    cy.url().should('include', '/login');
  });

  it('should persist session after page refresh', () => {
    cy.login('admin@hr-erp.com', 'password123');
    cy.visit('/dashboard');
    cy.reload();
    cy.url().should('include', '/dashboard');
  });

  it('should logout successfully', () => {
    cy.login('admin@hr-erp.com', 'password123');
    cy.visit('/dashboard');
    cy.logout();
    cy.url().should('include', '/login');
  });

  it('should not allow empty form submission', () => {
    cy.get('button[type="submit"]').click();
    cy.url().should('include', '/login');
  });
});
