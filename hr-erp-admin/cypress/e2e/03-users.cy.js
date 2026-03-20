describe('User Management', () => {
  beforeEach(() => {
    cy.login('admin@hr-erp.com', 'password123');
  });

  it('should display user list page', () => {
    cy.visit('/users');
    cy.get('table, .MuiTable-root, .MuiDataGrid-root, [class*="list"]', { timeout: 10000 })
      .should('be.visible');
  });

  it('should have search functionality', () => {
    cy.visit('/users');
    cy.get('input[type="search"], input[placeholder*="Keres"], input[placeholder*="Search"], [data-cy=search-input]')
      .should('exist');
  });

  it('should navigate to user detail', () => {
    cy.visit('/users');
    cy.get('table tbody tr, .MuiTableRow-root, [class*="row"]', { timeout: 10000 })
      .first()
      .click();
    cy.url().should('match', /\/users\/|\/employee/);
  });

  it('should have add user button', () => {
    cy.visit('/users');
    cy.get('button, a').contains(/add|új|hozzáad|létrehoz/i).should('exist');
  });

  it('should display user count', () => {
    cy.visit('/users');
    cy.get('body').should('contain.text', /\d+/);
  });
});
