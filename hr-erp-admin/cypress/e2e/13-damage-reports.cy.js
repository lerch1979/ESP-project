describe('Damage Report System', () => {
  beforeEach(() => {
    cy.login('admin@hr-erp.com', 'password123');
  });

  it('should display damage report list', () => {
    cy.visit('/damage-reports');
    cy.get('table, .MuiTable-root, [class*="list"]', { timeout: 10000 })
      .should('be.visible');
  });

  it('should have create report button', () => {
    cy.visit('/damage-reports');
    cy.get('button, a').contains(/create|new|új|létrehoz|jegyzőkönyv/i).should('exist');
  });

  it('should show report numbers (KJ-YYYY-MM-NNNN format)', () => {
    cy.visit('/damage-reports');
    cy.get('body').invoke('text').should('match', /KJ-\d{4}-\d{2}-\d{4}/);
  });

  it('should navigate to report detail', () => {
    cy.visit('/damage-reports');
    cy.get('table tbody tr, [class*="row"]', { timeout: 10000 })
      .first()
      .click();
    cy.url().should('match', /\/damage-reports\//);
  });
});
