describe('Dashboard', () => {
  beforeEach(() => {
    cy.login('admin@hr-erp.com', 'password123');
    cy.visit('/dashboard');
  });

  it('should load dashboard page', () => {
    cy.url().should('include', '/dashboard');
  });

  it('should display summary statistics cards', () => {
    cy.get('.MuiCard-root, .MuiPaper-root, [class*="stat"]')
      .should('have.length.at.least', 2);
  });

  it('should display charts after loading', () => {
    // Charts may take time to render
    cy.get('canvas, svg, [class*="chart"], [class*="Chart"]', { timeout: 15000 })
      .should('have.length.at.least', 1);
  });

  it('should have navigation sidebar', () => {
    cy.get('nav, .MuiDrawer-root, [class*="sidebar"]').should('be.visible');
  });

  it('should navigate to users page from sidebar', () => {
    cy.contains('a, [role="button"]', /user|felhasználó|munkavállaló/i).first().click();
    cy.url().should('not.include', '/dashboard');
  });

  it('should show user info in header/appbar', () => {
    cy.get('.MuiAppBar-root, header').should('be.visible');
  });
});
