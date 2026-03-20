describe('Document Management', () => {
  beforeEach(() => {
    cy.login('admin@hr-erp.com', 'password123');
  });

  it('should display document list', () => {
    cy.visit('/documents');
    cy.get('table, .MuiTable-root, [class*="list"], [class*="grid"]', { timeout: 10000 })
      .should('be.visible');
  });

  it('should have upload button', () => {
    cy.visit('/documents');
    cy.get('button, a').contains(/upload|feltölt|hozzáad/i).should('exist');
  });

  it('should show document types', () => {
    cy.visit('/documents');
    cy.get('[class*="badge"], [class*="chip"], .MuiChip-root')
      .should('have.length.at.least', 1);
  });
});
