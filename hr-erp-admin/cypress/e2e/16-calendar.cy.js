describe('Calendar', () => {
  beforeEach(() => {
    cy.login('admin@hr-erp.com', 'password123');
  });

  it('should display calendar view', () => {
    cy.visit('/calendar');
    cy.get('[class*="calendar"], .fc, table, [class*="schedule"]', { timeout: 10000 })
      .should('be.visible');
  });

  it('should navigate between months', () => {
    cy.visit('/calendar');
    cy.get('button').contains(/next|előre|>/i).first().click();
    cy.get('[class*="calendar"], .fc, table').should('be.visible');
  });
});
