describe('CarePath EAP Module', () => {
  beforeEach(() => {
    cy.login('admin@hr-erp.com', 'password123');
  });

  it('should load CarePath dashboard', () => {
    cy.visit('/carepath');
    cy.url().should('include', '/carepath');
  });

  it('should display case list', () => {
    cy.visit('/carepath/cases');
    cy.get('table, .MuiTable-root, [class*="list"], [class*="card"]', { timeout: 10000 })
      .should('be.visible');
  });

  it('should show case status distribution', () => {
    cy.visit('/carepath');
    cy.get('[class*="badge"], [class*="chip"], .MuiChip-root, canvas, svg')
      .should('have.length.at.least', 1);
  });

  it('should navigate to case detail', () => {
    cy.visit('/carepath/cases');
    cy.get('table tbody tr, [class*="row"], [class*="card"]', { timeout: 10000 })
      .first()
      .click();
    cy.url().should('match', /\/carepath\/cases\//);
  });
});
