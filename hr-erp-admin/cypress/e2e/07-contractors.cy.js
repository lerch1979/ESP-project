describe('Contractor Management', () => {
  beforeEach(() => {
    cy.login('admin@hr-erp.com', 'password123');
  });

  it('should display contractor list', () => {
    cy.visit('/contractors');
    cy.get('table, .MuiTable-root, [class*="list"], [class*="card"]', { timeout: 10000 })
      .should('be.visible');
  });

  it('should have search/filter functionality', () => {
    cy.visit('/contractors');
    cy.get('input[type="search"], input[placeholder*="Keres"], input[placeholder*="Search"]')
      .should('exist');
  });

  it('should navigate to contractor detail', () => {
    cy.visit('/contractors');
    cy.get('table tbody tr, [class*="row"], [class*="card"]', { timeout: 10000 })
      .first()
      .click();
    cy.url().should('match', /\/contractors\//);
  });
});
