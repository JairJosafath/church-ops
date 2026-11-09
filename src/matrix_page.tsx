import type { ReactElement } from 'react';

import { api } from './api_client';
import type { Service } from './api_types';
import { amsterdamDate, formatServiceDate } from './dutch_time';
import { Notice } from './form_fields';
import { cellSummary, scheduleMatrix, type MatrixCell, type MatrixColumn } from './matrix';
import { routeHref } from './routes';
import { REQUEST_STATUS_LABELS } from './scheduling';
import { useResource } from './use_resource';

/** How many upcoming plans the Matrix shows: about three months of Sundays. */
export const MATRIX_PLANS = 12;

/** The next MATRIX_PLANS plans from today (in Dutch time), each with its needs and requests. */
async function loadUpcomingPlans(signal: AbortSignal): Promise<Service[]> {
  const today = amsterdamDate(new Date().toISOString());
  if (today === null) {
    throw new Error('The clock gives no date.');
  }
  const summaries = await api.listServicesFrom(today, signal);
  return Promise.all(
    summaries.slice(0, MATRIX_PLANS).map((summary) => api.getService(summary.id, signal)),
  );
}

interface CellProps {
  readonly cell: MatrixCell;
  readonly column: MatrixColumn;
  readonly positionName: string;
}

/** A position at a plan: its people and their status, and the open slots; opens the plan's teams. */
function Cell({ cell, column, positionName }: CellProps): ReactElement {
  return (
    <td>
      <a
        className="matrix-cell"
        href={routeHref({ page: 'service_teams', serviceId: cell.serviceId })}
        aria-label={`${positionName} at ${column.title}, ${formatServiceDate(column.startsAt)}: ${cellSummary(cell)}`}
      >
        {cell.requests.map((request) => (
          <span key={request.id} className="matrix-person">
            {request.person.name}{' '}
            <span className={`badge status-${request.status}`}>
              {REQUEST_STATUS_LABELS[request.status]}
            </span>
          </span>
        ))}
        {cell.open > 0 ? <span className="open-slot">{cell.open} open</span> : null}
        {cell.requests.length === 0 && cell.open === 0 ? (
          <span className="muted">{cellSummary(cell)}</span>
        ) : null}
      </a>
    </td>
  );
}

/** Many plans side by side against the positions, to schedule months ahead. */
export function MatrixPage(): ReactElement {
  const [plans] = useResource(loadUpcomingPlans);

  return (
    <>
      <h1>Matrix</h1>
      <p className="muted">
        The next {MATRIX_PLANS} plans against the positions. Choose a cell to schedule that position
        on the plan.
      </p>
      {plans.status === 'loading' ? <p>Loading the plans…</p> : null}
      {plans.status === 'failed' ? <Notice message={plans.error} tone="error" /> : null}
      {plans.status === 'ready' ? <MatrixTable plans={plans.value} /> : null}
    </>
  );
}

function MatrixTable({ plans }: { readonly plans: readonly Service[] }): ReactElement {
  if (plans.length === 0) {
    return (
      <p>
        No plans from today on. Create one on the{' '}
        <a href={routeHref({ page: 'services' })}>Services</a> page.
      </p>
    );
  }
  const matrix = scheduleMatrix(plans);
  return (
    <>
      {matrix.teams.length === 0 ? (
        <p>None of these plans needs anyone yet. Open a plan and edit its needed positions.</p>
      ) : null}
      <div className="matrix-scroll" role="region" aria-label="Matrix" tabIndex={0}>
        <table className="matrix">
          <caption className="visually-hidden">The next plans, by position</caption>
          <thead>
            <tr>
              <th scope="col">Position</th>
              {matrix.columns.map((column) => (
                <th key={column.serviceId} scope="col">
                  <a href={routeHref({ page: 'service', serviceId: column.serviceId })}>
                    {column.title}
                  </a>
                  <span className="matrix-date">{formatServiceDate(column.startsAt)}</span>
                </th>
              ))}
            </tr>
          </thead>
          {matrix.teams.map((team) => (
            <tbody key={team.teamName}>
              <tr className="matrix-team">
                <th scope="rowgroup" colSpan={matrix.columns.length + 1}>
                  {team.teamName}
                </th>
              </tr>
              {team.rows.map((row) => (
                <tr key={row.position.id}>
                  <th scope="row">{row.position.name}</th>
                  {row.cells.map((cell, index) => {
                    const column = matrix.columns[index];
                    return column === undefined ? null : (
                      <Cell
                        key={cell.serviceId}
                        cell={cell}
                        column={column}
                        positionName={row.position.name}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </>
  );
}
