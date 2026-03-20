describe('Chatbot Admin', () => {
  beforeEach(() => {
    cy.login('admin@hr-erp.com', 'password123');
  });

  it('should display chatbot conversations list', () => {
    cy.visit('/chatbot');
    cy.get('table, .MuiTable-root, [class*="list"], [class*="conversation"]', { timeout: 10000 })
      .should('be.visible');
  });

  it('should show FAQ management', () => {
    cy.visit('/chatbot/faq');
    cy.get('table, [class*="list"], [class*="card"]', { timeout: 10000 })
      .should('be.visible');
  });

  it('should display conversation messages on click', () => {
    cy.visit('/chatbot');
    cy.get('table tbody tr, [class*="row"], [class*="conversation"]', { timeout: 10000 })
      .first()
      .click();
    cy.get('[class*="message"], [class*="chat"], [class*="bubble"]')
      .should('have.length.at.least', 1);
  });
});
