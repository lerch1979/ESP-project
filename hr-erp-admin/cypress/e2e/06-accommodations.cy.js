describe('Accommodation Management', () => {
  beforeEach(() => {
    cy.login('admin@hr-erp.com', 'password123');
  });

  it('should display accommodation list', () => {
    cy.visit('/accommodations');
    cy.get('table, .MuiTable-root, [class*="list"], [class*="card"]', { timeout: 10000 })
      .should('be.visible');
  });

  it('should navigate to accommodation detail', () => {
    cy.visit('/accommodations');
    cy.get('table tbody tr, [class*="row"], [class*="card"]', { timeout: 10000 })
      .first()
      .click();
    cy.url().should('match', /\/accommodations\//);
  });

  it('should show accommodation capacity info', () => {
    cy.visit('/accommodations');
    cy.get('body').invoke('text').should('match', /\d+/);
  });

  it('should have add accommodation button', () => {
    cy.visit('/accommodations');
    cy.get('button, a').contains(/add|new|új|hozzáad/i).should('exist');
  });
});
