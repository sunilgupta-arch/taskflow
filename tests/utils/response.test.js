const { ApiResponse, getPagination, getPaginationMeta } = require('../../utils/response');

// Minimal mock for Express res object
function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

// ─── ApiResponse.success ──────────────────────────────────────────────────────

describe('ApiResponse.success', () => {
  test('returns 200 with success:true and data by default', () => {
    const res = mockRes();
    ApiResponse.success(res, { id: 1 });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Success',
      data: { id: 1 },
    });
  });

  test('uses custom message and status code', () => {
    const res = mockRes();
    ApiResponse.success(res, {}, 'Created', 201);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Created' }));
  });

  test('defaults data to empty object when omitted', () => {
    const res = mockRes();
    ApiResponse.success(res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: {} }));
  });
});

// ─── ApiResponse.error ────────────────────────────────────────────────────────

describe('ApiResponse.error', () => {
  test('returns 500 with success:false by default', () => {
    const res = mockRes();
    ApiResponse.error(res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'An error occurred',
    });
  });

  test('uses custom message and status code', () => {
    const res = mockRes();
    ApiResponse.error(res, 'Not found', 404);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Not found' }));
  });

  test('includes errors field when provided', () => {
    const res = mockRes();
    const errors = [{ field: 'email', msg: 'Required' }];
    ApiResponse.error(res, 'Validation failed', 422, errors);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Validation failed',
      errors,
    });
  });

  test('omits errors field when not provided', () => {
    const res = mockRes();
    ApiResponse.error(res, 'Bad request', 400);
    const [payload] = res.json.mock.calls[0];
    expect(payload).not.toHaveProperty('errors');
  });
});

// ─── ApiResponse.paginated ────────────────────────────────────────────────────

describe('ApiResponse.paginated', () => {
  test('returns 200 with data and pagination', () => {
    const res = mockRes();
    const pagination = { total: 50, page: 1, limit: 10 };
    ApiResponse.paginated(res, [{ id: 1 }], pagination);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Success',
      data: [{ id: 1 }],
      pagination,
    });
  });

  test('uses custom message', () => {
    const res = mockRes();
    ApiResponse.paginated(res, [], {}, 'Users fetched');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Users fetched' }));
  });
});

// ─── getPagination ────────────────────────────────────────────────────────────

describe('getPagination', () => {
  test('returns correct offset for page 1', () => {
    expect(getPagination(1, 10)).toEqual({ page: 1, limit: 10, offset: 0 });
  });

  test('returns correct offset for page 2', () => {
    expect(getPagination(2, 10)).toEqual({ page: 2, limit: 10, offset: 10 });
  });

  test('returns correct offset for page 3 with limit 5', () => {
    expect(getPagination(3, 5)).toEqual({ page: 3, limit: 5, offset: 10 });
  });

  test('casts string inputs to integers', () => {
    const result = getPagination('2', '20');
    expect(result).toEqual({ page: 2, limit: 20, offset: 20 });
  });

  test('defaults to page 1 / limit 10 when not provided', () => {
    expect(getPagination()).toEqual({ page: 1, limit: 10, offset: 0 });
  });
});

// ─── getPaginationMeta ────────────────────────────────────────────────────────

describe('getPaginationMeta', () => {
  test('calculates totalPages correctly', () => {
    const meta = getPaginationMeta(100, 1, 10);
    expect(meta.totalPages).toBe(10);
  });

  test('rounds up for uneven total', () => {
    const meta = getPaginationMeta(25, 1, 10);
    expect(meta.totalPages).toBe(3);
  });

  test('hasNext is true when not on last page', () => {
    const meta = getPaginationMeta(30, 1, 10);
    expect(meta.hasNext).toBe(true);
  });

  test('hasNext is false on last page', () => {
    const meta = getPaginationMeta(30, 3, 10);
    expect(meta.hasNext).toBe(false);
  });

  test('hasPrev is false on first page', () => {
    const meta = getPaginationMeta(30, 1, 10);
    expect(meta.hasPrev).toBe(false);
  });

  test('hasPrev is true on page 2+', () => {
    const meta = getPaginationMeta(30, 2, 10);
    expect(meta.hasPrev).toBe(true);
  });

  test('casts string inputs to integers', () => {
    const meta = getPaginationMeta(20, '2', '10');
    expect(meta.page).toBe(2);
    expect(meta.limit).toBe(10);
  });
});
