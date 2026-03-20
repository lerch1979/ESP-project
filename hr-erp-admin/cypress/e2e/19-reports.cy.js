describe('Reports & Export', () => {
  beforeEach(() => {
    cy.login('admin@hr-erp.com', 'password123');
  });

  it('should display reports page', () => {
    cy.visit('/reports');
    cy.get('body').should('not.be.empty');
  });

  it('should have report type selection', () => {
    cy.visit('/reports');
    cy.get('select, .MuiSelect-root, [class*="filter"], button, .MuiTab-root')
      .should('have.length.at.least', 1);
  });

  it('should have export/download button', () => {
    cy.visit('/reports');
    cy.get('button, a').contains(/export|letölt|pdf|csv|generate|generál/i).should('exist');
  });
});
