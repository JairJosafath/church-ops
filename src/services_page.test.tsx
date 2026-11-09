// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ServicesPage } from './services_page';
import { fakeApi, type FakeApi, type Route } from './test_fetch';
import { serviceJson, serviceSummaryJson, serviceTypeJson } from './test_fixtures';

function renderPage(routes: Readonly<Record<string, Route>>): FakeApi {
  const api = fakeApi(routes);
  vi.stubGlobal('fetch', api.fetch);
  render(<ServicesPage />);
  return api;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '#/services';
});

afterEach(cleanup);

describe('ServicesPage', () => {
  it('lists the services with their date, times and items', async () => {
    renderPage({ 'GET /api/services': { json: [serviceSummaryJson()] } });
    expect(await screen.findByRole('link', { name: 'Sunday morning' })).toHaveProperty(
      'hash',
      '#/services/20',
    );
    expect(screen.getByText(/Sunday 15 November 2026, 10:00–11:15 · 9 items/)).toBeTruthy();
  });

  it('says so when there are no services', async () => {
    renderPage({ 'GET /api/services': { json: [] } });
    expect(await screen.findByText(/No services yet/)).toBeTruthy();
  });

  it('creates a service starting at a Dutch time and opens its plan', async () => {
    const api = renderPage({
      'GET /api/services': { json: [] },
      'POST /api/services': { status: 201, json: serviceJson({ id: 21, title: 'Advent 1' }) },
    });
    const form = within(await screen.findByRole('form', { name: 'New service' }));
    fireEvent.change(form.getByLabelText('Title'), { target: { value: 'Advent 1' } });
    fireEvent.change(form.getByLabelText('Starts', { exact: false }), {
      target: { value: '2026-11-29T10:00' },
    });
    fireEvent.click(form.getByRole('button', { name: 'Create service' }));
    expect(await screen.findByText('Created Advent 1.')).toBeTruthy();
    expect(api.sent.find((request) => request.method === 'POST')?.body).toEqual({
      title: 'Advent 1',
      service_type: 'Sunday morning',
      starts_at: '2026-11-29T10:00:00+01:00',
      streamed: true,
    });
    expect(window.location.hash).toBe('#/services/21');
  });

  it('copies a past service to a new date and opens the copy', async () => {
    const api = renderPage({
      'GET /api/services': { json: [serviceSummaryJson()] },
      'POST /api/services/20/copy': { status: 201, json: serviceJson({ id: 22 }) },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Copy…' }));
    const form = within(screen.getByRole('form', { name: 'Copy Sunday morning' }));
    fireEvent.change(form.getByLabelText('Copy starts', { exact: false }), {
      target: { value: '2026-11-22T10:00' },
    });
    fireEvent.click(form.getByRole('button', { name: 'Copy service' }));
    expect(await screen.findByText('Copied into Sunday morning.')).toBeTruthy();
    expect(api.sent.find((request) => request.method === 'POST')?.body).toEqual({
      starts_at: '2026-11-22T10:00:00+01:00',
    });
    expect(window.location.hash).toBe('#/services/22');
  });

  it('asks for a start time before creating a service', async () => {
    const api = renderPage({ 'GET /api/services': { json: [] } });
    const form = within(await screen.findByRole('form', { name: 'New service' }));
    fireEvent.change(form.getByLabelText('Title'), { target: { value: 'Advent 1' } });
    fireEvent.click(form.getByRole('button', { name: 'Create service' }));
    expect(form.getByText('Choose the date and time it starts.')).toBeTruthy();
    expect(api.sentRoutes()).not.toContain('POST /api/services');
  });

  // v0.2 songs and plans

  it('creates a plan from a service type on a date, with a series, and opens it', async () => {
    const api = renderPage({
      'GET /api/services': { json: [] },
      'GET /api/service-types': {
        json: [
          serviceTypeJson(),
          serviceTypeJson({ id: 5, name: 'Youth evening', start_time: '19:30' }),
        ],
      },
      'POST /api/services': { status: 201, json: serviceJson({ id: 21, title: 'Advent 1' }) },
    });
    expect(await screen.findByRole('option', { name: 'Youth evening' })).toBeTruthy();
    const form = within(screen.getByRole('form', { name: 'New service' }));
    expect(form.getByLabelText<HTMLSelectElement>('Service type').value).toBe('4');
    expect(form.getByText('Starts at 10:00, Dutch time.')).toBeTruthy();
    fireEvent.change(form.getByLabelText('Date', { exact: false }), {
      target: { value: '2026-11-29' },
    });
    fireEvent.change(form.getByLabelText('Title', { exact: false }), {
      target: { value: 'Advent 1' },
    });
    fireEvent.change(form.getByLabelText('Series', { exact: false }), {
      target: { value: 'Advent' },
    });
    fireEvent.click(form.getByRole('button', { name: 'Create service' }));
    expect(await screen.findByText('Created Advent 1.')).toBeTruthy();
    expect(api.sent.find((request) => request.method === 'POST')?.body).toEqual({
      title: 'Advent 1',
      service_type: 'Sunday morning',
      service_type_id: 4,
      date: '2026-11-29',
      series: 'Advent',
      streamed: true,
    });
    expect(window.location.hash).toBe('#/services/21');
  });

  it('names a plan after its type when the title is left blank', async () => {
    const api = renderPage({
      'GET /api/services': { json: [] },
      'GET /api/service-types': { json: [serviceTypeJson()] },
      'POST /api/services': { status: 201, json: serviceJson({ id: 21 }) },
    });
    await screen.findByRole('option', { name: 'Sunday morning' });
    const form = within(screen.getByRole('form', { name: 'New service' }));
    fireEvent.change(form.getByLabelText('Date', { exact: false }), {
      target: { value: '2026-11-29' },
    });
    fireEvent.click(form.getByRole('button', { name: 'Create service' }));
    expect(await screen.findByText('Created Sunday morning.')).toBeTruthy();
    expect(api.sent.find((request) => request.method === 'POST')?.body).toMatchObject({
      title: 'Sunday morning',
      series: '',
    });
  });

  it('asks for the date of a plan from a type', async () => {
    const api = renderPage({
      'GET /api/services': { json: [] },
      'GET /api/service-types': { json: [serviceTypeJson()] },
    });
    await screen.findByRole('option', { name: 'Sunday morning' });
    const form = within(screen.getByRole('form', { name: 'New service' }));
    fireEvent.click(form.getByRole('button', { name: 'Create service' }));
    expect(form.getByText('Choose the date.')).toBeTruthy();
    expect(api.sentRoutes()).not.toContain('POST /api/services');
  });

  it('shows each service’s series, and links to the service types', async () => {
    renderPage({ 'GET /api/services': { json: [serviceSummaryJson({ series: 'Advent' })] } });
    expect(await screen.findByText('Sunday morning · Advent')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Service types' }).getAttribute('href')).toBe(
      '#/service-types',
    );
  });

  it('says what happened when the server cannot be reached', async () => {
    const fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    vi.stubGlobal('fetch', fetch);
    render(<ServicesPage />);
    expect(await screen.findByText(/Could not reach the server/)).toBeTruthy();
  });
});
