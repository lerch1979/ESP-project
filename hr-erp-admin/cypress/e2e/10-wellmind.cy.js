describe('WellMind Module', () => {
  beforeEach(() => {
    cy.login('admin@hr-erp.com', 'password123');
  });

  it('should load WellMind dashboard', () => {
    cy.visit('/wellmind');
    cy.url().should('include', '/wellmind');
  });

  it('should display wellbeing statistics', () => {
    cy.visit('/wellmind');
    cy.get('.MuiCard-root, .MuiPaper-root, [class*="stat"]', { timeout: 15000 })
      .should('have.length.at.least', 1);
  });

  it('should show pulse question management', () => {
    cy.visit('/wellmind/questions');
    cy.get('table, .MuiTable-root, [class*="list"]', { timeout: 10000 })
      .should('be.visible');
  });

  it('should display category breakdown', () => {
    cy.visit('/wellmind');
    cy.get('body').invoke('text')
      .should('match', /mental|physical|social|housing|fizikai|mentális|szociális|szállás/i);
  });
});
