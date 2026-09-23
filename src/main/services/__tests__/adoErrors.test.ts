import { describe, it, expect } from 'vitest';
import { describeAdoFailure } from '../adoErrors';

const ctx = { organizationUrl: 'https://dev.azure.com/myorg', project: 'AI og DT' };

describe('describeAdoFailure', () => {
  it('reads 401 as a rejected PAT and says where to update it', () => {
    const msg = describeAdoFailure({ status: 401, body: '' }, ctx);
    expect(msg).toMatch(/Personal Access Token/);
    expect(msg).toMatch(/expired|revoked/);
    expect(msg).toMatch(/Project Settings/);
  });

  it('reads 203 (ADO serves its HTML sign-in page for a bad PAT) as a rejected PAT', () => {
    expect(describeAdoFailure({ status: 203, body: '<html>' }, ctx)).toMatch(/expired|revoked/);
  });

  it('reads an HTML answer on a 200 (sign-in redirect was followed) as a rejected PAT', () => {
    const msg = describeAdoFailure(
      { status: 200, body: '<!DOCTYPE html>', contentType: 'text/html; charset=utf-8' },
      ctx,
    );
    expect(msg).toMatch(/expired|revoked/);
  });

  it('reads 403 as a missing scope', () => {
    expect(describeAdoFailure({ status: 403, body: '' }, ctx)).toMatch(/Work Items/);
  });

  it('reads 404 as project/org not found and names both', () => {
    const msg = describeAdoFailure({ status: 404, body: '' }, ctx);
    expect(msg).toContain('"AI og DT"');
    expect(msg).toContain('https://dev.azure.com/myorg');
    expect(msg).toMatch(/Project Settings/);
    expect(msg).not.toMatch(/ADO API 404/);
  });

  it('reads a timeout as the service not responding', () => {
    const err = Object.assign(new Error('aborted'), { name: 'AbortError' });
    expect(describeAdoFailure({ error: err }, ctx)).toMatch(/didn't respond/);
  });

  it('reads a fetch failure as a network problem', () => {
    expect(describeAdoFailure({ error: new TypeError('fetch failed') }, ctx)).toMatch(
      /Couldn't reach Azure DevOps/,
    );
  });

  it('keeps the status and a short body excerpt for anything else', () => {
    const msg = describeAdoFailure({ status: 500, body: 'x'.repeat(500) }, ctx);
    expect(msg).toContain('HTTP 500');
    expect(msg.length).toBeLessThan(300);
  });

  it('pulls the message out of an ADO JSON error body', () => {
    const body = JSON.stringify({
      message: 'TF51005: The query references a field that does not exist.',
    });
    expect(describeAdoFailure({ status: 400, body }, ctx)).toContain('TF51005');
  });

  it('never echoes a PAT that appears in the body', () => {
    const msg = describeAdoFailure(
      { status: 500, body: 'token=secretpat123' },
      {
        ...ctx,
        pat: 'secretpat123',
      },
    );
    expect(msg).not.toContain('secretpat123');
  });
});
