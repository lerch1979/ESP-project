describe('Responsive Design', () => {
  beforeEach(() => {
    cy.login('admin@hr-erp.com', 'password123');
  });

  it('should display correctly on tablet', () => {
    cy.viewport(768, 1024);
    cy.visit('/dashboard');
    cy.get('.MuiAppBar-root, header, nav').should('be.visible');
  });

  it('should display correctly on mobile', () => {
    cy.viewport(375, 667);
    cy.visit('/dashboard');
    cy.get('body').should('be.visible');
    // Sidebar should be collapsed on mobile
    cy.get('.MuiDrawer-root').should('not.be.visible');
  });

  it('should show hamburger menu on mobile', () => {
    cy.viewport(375, 667);
    cy.visit('/dashboard');
    cy.get('[aria-label*="menu"], [data-cy=menu-button], .MuiIconButton-root')
      .should('be.visible');
  });

  it('should render tables responsively on mobile', () => {
    cy.viewport(375, 667);
    cy.visit('/users');
    cy.get('body').should('be.visible');
    // Content should not overflow
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.lte(doc.documentElement.clientWidth + 10);
    });
  });
});
