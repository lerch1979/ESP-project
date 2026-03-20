describe('Invoice Management', () => {
  beforeEach(() => {
    cy.login('admin@hr-erp.com', 'password123');
  });

  it('should display invoice list', () => {
    cy.visit('/invoices');
    cy.get('table, .MuiTable-root, [class*="list"]', { timeout: 10000 })
      .should('be.visible');
  });

  it('should have status filter', () => {
    cy.visit('/invoices');
    cy.get('select, .MuiSelect-root, [class*="filter"], .MuiChip-root')
      .should('have.length.at.least', 1);
  });

  it('should navigate to invoice detail', () => {
    cy.visit('/invoices');
    cy.get('table tbody tr, [class*="row"]', { timeout: 10000 })
      .first()
      .click();
    cy.url().should('match', /\/invoices\//);
  });

  it('should show invoice amounts', () => {
    cy.visit('/invoices');
    cy.get('body').invoke('text').should('match', /\d+[\.,]\d+|Ft|EUR|HUF/);
  });
});
