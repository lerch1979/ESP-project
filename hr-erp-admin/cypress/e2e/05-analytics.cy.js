describe('Analytics Dashboard', () => {
  beforeEach(() => {
    cy.login('admin@hr-erp.com', 'password123');
  });

  it('should load analytics page', () => {
    cy.visit('/analytics/pulse');
    cy.url().should('include', '/analytics');
  });

  it('should display overview statistics', () => {
    cy.visit('/analytics/pulse');
    cy.get('.MuiCard-root, .MuiPaper-root, [class*="stat"]', { timeout: 15000 })
      .should('have.length.at.least', 2);
  });

  it('should render charts', () => {
    cy.visit('/analytics/pulse');
    cy.get('canvas, svg, [class*="chart"]', { timeout: 15000 })
      .should('have.length.at.least', 1);
  });

  it('should have category filter', () => {
    cy.visit('/analytics/pulse');
    cy.get('select, .MuiSelect-root, [class*="filter"]')
      .should('have.length.at.least', 1);
  });

  it('should display housing insights section', () => {
    cy.visit('/analytics/pulse');
    cy.get('body').invoke('text').should('match', /housing|szállás|lakhatás/i);
  });
});
