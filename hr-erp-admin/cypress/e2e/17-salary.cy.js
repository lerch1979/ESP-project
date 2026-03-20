describe('Salary Management', () => {
  beforeEach(() => {
    cy.login('admin@hr-erp.com', 'password123');
  });

  it('should display salary list', () => {
    cy.visit('/salaries');
    cy.get('table, .MuiTable-root, [class*="list"]', { timeout: 10000 })
      .should('be.visible');
  });

  it('should show salary amounts', () => {
    cy.visit('/salaries');
    cy.get('body').invoke('text').should('match', /\d+[\.,]\d+|Ft|EUR|HUF/);
  });

  it('should have export functionality', () => {
    cy.visit('/salaries');
    cy.get('button, a').contains(/export|letölt|csv/i).should('exist');
  });
});
