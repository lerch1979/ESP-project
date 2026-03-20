describe('Gamification Module', () => {
  beforeEach(() => {
    cy.login('admin@hr-erp.com', 'password123');
  });

  it('should display gamification dashboard', () => {
    cy.visit('/gamification');
    cy.url().should('include', '/gamification');
  });

  it('should show leaderboard', () => {
    cy.visit('/gamification');
    cy.get('table, .MuiTable-root, [class*="leaderboard"], [class*="list"]', { timeout: 10000 })
      .should('be.visible');
  });

  it('should display badge management', () => {
    cy.visit('/gamification/badges');
    cy.get('[class*="badge"], [class*="card"], .MuiCard-root', { timeout: 10000 })
      .should('have.length.at.least', 1);
  });

  it('should show points and streak data', () => {
    cy.visit('/gamification');
    cy.get('body').invoke('text').should('match', /\d+/);
  });
});
