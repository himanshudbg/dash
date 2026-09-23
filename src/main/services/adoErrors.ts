/**
 * Turn a failed Azure DevOps request into a message the user can act on.
 *
 * ADO's failure modes don't map one-to-one onto statuses: a bad PAT usually comes
 * back as 401, but some endpoints answer 203 with the HTML sign-in page, and an
 * anonymous request is redirected to that page (which fetch follows to a 200). A
 * 404 carries an empty body, so the raw `ADO API 404:` said nothing about which
 * part of the config was wrong.
 */
export interface AdoFailure {
  status?: number;
  body?: string;
  contentType?: string | null;
  /** Set when fetch itself threw (network down, DNS, timeout). */
  error?: unknown;
}

interface AdoFailureContext {
  organizationUrl: string;
  project: string;
  /** Scrubbed from anything echoed back from the response body. */
  pat?: string;
}

const WHERE = 'Update it in Project Settings → Azure DevOps.';

export function describeAdoFailure(failure: AdoFailure, ctx: AdoFailureContext): string {
  if (failure.error !== undefined) {
    if (failure.error instanceof Error && failure.error.name === 'AbortError') {
      return "Azure DevOps didn't respond in time. Try again in a moment.";
    }
    return "Couldn't reach Azure DevOps. Check your network connection and the organization URL.";
  }

  const status = failure.status ?? 0;
  const isHtml = /text\/html/i.test(failure.contentType ?? '');

  if (status === 401 || status === 203 || isHtml) {
    return `Azure DevOps rejected the Personal Access Token: it may be expired, revoked or mistyped. ${WHERE}`;
  }
  if (status === 403) {
    return `The Personal Access Token doesn't have access to this. It needs the Work Items (Read & write) scope. ${WHERE}`;
  }
  if (status === 404) {
    return `Azure DevOps couldn't find project "${ctx.project}" in ${ctx.organizationUrl}. Check the organization URL and project name in Project Settings → Azure DevOps, and that the token can see this project.`;
  }

  const detail = scrub(bodyMessage(failure.body ?? ''), ctx.pat);
  return `Azure DevOps request failed (HTTP ${status})${detail ? `: ${detail}` : '.'}`;
}

function bodyMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: unknown };
    if (typeof parsed.message === 'string') return parsed.message.slice(0, 200);
  } catch {
    // Not JSON — fall through to the raw excerpt.
  }
  return body.trim().slice(0, 200);
}

function scrub(text: string, pat?: string): string {
  return pat ? text.split(pat).join('***') : text;
}
