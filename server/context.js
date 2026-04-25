// Extracts organization_id and branch_id from request headers.
// Frontend sends X-Org-ID and X-Branch-ID on every authenticated request.
// Defaults to 1 so existing data (seeded with DEFAULT 1) stays accessible.
function getContext(req) {
  const orgId    = parseInt(req.headers['x-org-id'],    10) || 1;
  const branchId = parseInt(req.headers['x-branch-id'], 10) || 1;
  return { orgId, branchId };
}

module.exports = { getContext };
