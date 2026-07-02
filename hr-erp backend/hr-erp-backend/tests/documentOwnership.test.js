/**
 * Ownership scoping for the staff /documents API (audit fix, migration 129).
 *
 * Residents no longer hold `documents.view` (the primary control), but the
 * controller also self-scopes any non-staff caller to their OWN employee
 * documents — so a mis-granted token can never read another employee's files
 * (incl. medical). Staff are additionally scoped to their OWN contractor
 * (audit finding #3); superadmin sees all.
 */
const mockQuery = jest.fn();
jest.mock('../src/database/connection', () => ({ query: (...a) => mockQuery(...a) }));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const { getDocumentById, getDocuments } = require('../src/controllers/document.controller');

const mockRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });
beforeEach(() => mockQuery.mockReset());

describe('getDocumentById — non-staff cannot read another employee\'s document', () => {
  test('resident requesting someone else\'s document → 404', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'doc-1', employee_id: 'emp-OTHER', document_type: 'medical' }] }) // the doc
      .mockResolvedValueOnce({ rows: [{ id: 'emp-SELF' }] }); // resolveDocScope → caller's own employee
    const req = { params: { id: 'doc-1' }, user: { id: 'u-res', roles: ['accommodated_employee'] } };
    const res = mockRes();

    await getDocumentById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('resident requesting their OWN document → 200', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'doc-2', employee_id: 'emp-SELF', document_type: 'medical' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'emp-SELF' }] });
    const req = { params: { id: 'doc-2' }, user: { id: 'u-res', roles: ['accommodated_employee'] } };
    const res = mockRes();

    await getDocumentById(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('staff (admin) reads a document in their OWN contractor → 200, no self-scope lookup', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'doc-3', employee_id: 'emp-OTHER', document_type: 'medical', _doc_contractor: 'c-1' }] });
    const req = { params: { id: 'doc-3' }, user: { id: 'u-adm', roles: ['admin'], contractorId: 'c-1' } };
    const res = mockRes();

    await getDocumentById(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(mockQuery).toHaveBeenCalledTimes(1); // staff path never looks up an employee record
  });

  test('staff (admin) reading ANOTHER contractor\'s document → 404 (tenant scoped)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'doc-3', employee_id: 'emp-OTHER', document_type: 'medical', _doc_contractor: 'c-OTHER' }] });
    const req = { params: { id: 'doc-3' }, user: { id: 'u-adm', roles: ['admin'], contractorId: 'c-1' } };
    const res = mockRes();

    await getDocumentById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('superadmin reads ANY contractor\'s document → 200 (bypass)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'doc-3', employee_id: 'emp-OTHER', document_type: 'medical', _doc_contractor: 'c-OTHER' }] });
    const req = { params: { id: 'doc-3' }, user: { id: 'u-sa', roles: ['superadmin'], contractorId: 'c-1' } };
    const res = mockRes();

    await getDocumentById(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

describe('getDocuments — list is forced to the caller\'s own employee_id', () => {
  test('resident list is filtered to their own employee_id, ignoring ?employee_id', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'emp-SELF' }] })  // resolveDocScope
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })       // count
      .mockResolvedValueOnce({ rows: [] });                    // page
    const req = { query: { employee_id: 'emp-OTHER' }, user: { id: 'u-res', roles: ['accommodated_employee'] } };
    const res = mockRes();

    await getDocuments(req, res);

    // Every documents query must have been parameterised with the caller's own
    // employee id, never the attacker-supplied 'emp-OTHER'.
    const params = mockQuery.mock.calls.flatMap(c => c[1] || []);
    expect(params).toContain('emp-SELF');
    expect(params).not.toContain('emp-OTHER');
  });

  test('non-staff caller with no employee record gets an empty list (no doc query)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // resolveDocScope → no employee record
    const req = { query: {}, user: { id: 'u-ghost', roles: ['accommodated_employee'] } };
    const res = mockRes();

    await getDocuments(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ documents: [] }),
    }));
    expect(mockQuery).toHaveBeenCalledTimes(1); // only the employee lookup; never queried documents
  });
});
