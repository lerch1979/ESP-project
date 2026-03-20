describe('Project Management', () => {
  beforeEach(() => {
    cy.login('admin@hr-erp.com', 'password123');
  });

  it('should display project list', () => {
    cy.visit('/projects');
    cy.get('table, .MuiTable-root, [class*="list"], [class*="card"], [class*="board"]', { timeout: 10000 })
      .should('be.visible');
  });

  it('should navigate to project detail', () => {
    cy.visit('/projects');
    cy.get('table tbody tr, [class*="row"], [class*="card"]', { timeout: 10000 })
      .first()
      .click();
    cy.url().should('match', /\/projects\//);
  });

  it('should show project status indicators', () => {
    cy.visit('/projects');
    cy.get('[class*="badge"], [class*="chip"], .MuiChip-root, [class*="status"]')
      .should('have.length.at.least', 1);
  });
});
