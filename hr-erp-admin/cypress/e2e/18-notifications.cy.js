describe('Notifications', () => {
  beforeEach(() => {
    cy.login('admin@hr-erp.com', 'password123');
  });

  it('should show notification bell icon', () => {
    cy.visit('/dashboard');
    cy.get('[class*="notification"], [data-cy=notification-bell], .MuiBadge-root, [aria-label*="notification"]')
      .should('exist');
  });

  it('should display notification list', () => {
    cy.visit('/notifications');
    cy.get('[class*="notification"], [class*="list"], .MuiList-root', { timeout: 10000 })
      .should('be.visible');
  });
});
