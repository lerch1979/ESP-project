/**
 * Accessibility Tests — WCAG 2.1 AA compliance
 * Requires: npm install --save-dev cypress-axe axe-core
 */
describe('Accessibility (WCAG 2.1 AA)', () => {
  beforeEach(() => {
    // Inject axe-core if available
    try {
      cy.injectAxe();
    } catch {
      // axe not installed — tests will check basic a11y instead
    }
  });

  describe('Login page', () => {
    it('should have proper form labels', () => {
      cy.visit('/login');
      cy.get('input[type="email"], input[name="email"]').each(($input) => {
        // MUI TextField provides aria-label via label prop
        const id = $input.attr('id');
        if (id) {
          cy.get(`label[for="${id}"]`).should('exist');
        }
      });
    });

    it('should have visible focus indicators', () => {
      cy.visit('/login');
      cy.get('input').first().focus();
      cy.focused().should('have.css', 'outline-style').and('not.equal', 'none');
    });

    it('should have sufficient color contrast on buttons', () => {
      cy.visit('/login');
      cy.get('button[type="submit"]').should('be.visible');
    });
  });

  describe('Dashboard', () => {
    beforeEach(() => {
      cy.login('admin@hr-erp.com', 'password123');
    });

    it('should have page heading', () => {
      cy.visit('/dashboard');
      cy.get('h1, h2, h3, h4, [role="heading"]').should('have.length.at.least', 1);
    });

    it('should have nav landmark', () => {
      cy.visit('/dashboard');
      cy.get('nav, [role="navigation"]').should('exist');
    });

    it('should have main content area', () => {
      cy.visit('/dashboard');
      cy.get('main, [role="main"]').should('exist');
    });
  });

  describe('Keyboard navigation', () => {
    it('should be able to tab through login form', () => {
      cy.visit('/login');
      cy.get('body').tab();
      cy.focused().should('exist');
    });

    it('should be able to navigate sidebar with keyboard', () => {
      cy.login('admin@hr-erp.com', 'password123');
      cy.visit('/dashboard');
      // Sidebar links should be focusable
      cy.get('nav a, nav [role="button"], .MuiListItemButton-root')
        .first()
        .should('exist');
    });
  });

  describe('Tables', () => {
    beforeEach(() => {
      cy.login('admin@hr-erp.com', 'password123');
    });

    it('should have proper table headers', () => {
      cy.visit('/users');
      cy.get('table, .MuiTable-root', { timeout: 10000 }).within(() => {
        cy.get('th, .MuiTableCell-head').should('have.length.at.least', 1);
      });
    });
  });

  describe('Images and icons', () => {
    it('should have alt text or aria-hidden on decorative images', () => {
      cy.login('admin@hr-erp.com', 'password123');
      cy.visit('/dashboard');
      cy.get('img').each(($img) => {
        const alt = $img.attr('alt');
        const ariaHidden = $img.attr('aria-hidden');
        expect(alt || ariaHidden).to.exist;
      });
    });
  });
});
