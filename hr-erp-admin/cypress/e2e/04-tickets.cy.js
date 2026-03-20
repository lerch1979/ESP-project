describe('Ticket Management', () => {
  beforeEach(() => {
    cy.login('admin@hr-erp.com', 'password123');
  });

  it('should display ticket list', () => {
    cy.visit('/tickets');
    cy.get('table, .MuiTable-root, .MuiDataGrid-root, [class*="list"], [class*="card"]', { timeout: 10000 })
      .should('be.visible');
  });

  it('should have filter controls', () => {
    cy.visit('/tickets');
    cy.get('select, .MuiSelect-root, [class*="filter"], input[type="search"]')
      .should('have.length.at.least', 1);
  });

  it('should navigate to ticket detail', () => {
    cy.visit('/tickets');
    cy.get('table tbody tr, .MuiTableRow-root, [class*="row"], [class*="card"]', { timeout: 10000 })
      .first()
      .click();
    cy.url().should('match', /\/tickets\//);
  });

  it('should have create ticket button', () => {
    cy.visit('/tickets');
    cy.get('button, a').contains(/create|new|új|létrehoz/i).should('exist');
  });

  it('should show ticket status badges', () => {
    cy.visit('/tickets');
    cy.get('[class*="badge"], [class*="chip"], .MuiChip-root')
      .should('have.length.at.least', 1);
  });
});
