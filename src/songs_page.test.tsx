// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SongsPage } from './songs_page';
import { fakeApi } from './test_fetch';
import { arrangementJson, songJson } from './test_fixtures';

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(cleanup);

describe('SongsPage', () => {
  it('lists songs with their arrangements', async () => {
    vi.stubGlobal('fetch', fakeApi({ 'GET /api/songs': { json: [songJson()] } }).fetch);
    render(<SongsPage />);
    expect(await screen.findByRole('heading', { name: 'Amazing Grace' })).toBeTruthy();
    expect(screen.getByText('John Newton · CCLI 22025')).toBeTruthy();
    expect(screen.getByText('Key G')).toBeTruthy();
    expect(screen.getByText('72 BPM, 4/4')).toBeTruthy();
  });

  it('creates a song', async () => {
    const api = fakeApi({
      'GET /api/songs': { json: [] },
      'POST /api/songs': { status: 201, json: songJson({ arrangements: [] }) },
    });
    vi.stubGlobal('fetch', api.fetch);
    render(<SongsPage />);
    const form = within(await screen.findByRole('form', { name: 'New song' }));
    fireEvent.change(form.getByLabelText('Title'), { target: { value: 'Amazing Grace' } });
    fireEvent.change(form.getByLabelText('Authors'), { target: { value: 'John Newton' } });
    fireEvent.click(form.getByRole('button', { name: 'Add song' }));
    expect(await screen.findByText(/Added Amazing Grace/)).toBeTruthy();
    expect(api.sent.find((request) => request.method === 'POST')?.body).toEqual({
      title: 'Amazing Grace',
      authors: 'John Newton',
    });
  });

  it('adds an arrangement to a song', async () => {
    const api = fakeApi({
      'GET /api/songs': { json: [songJson({ arrangements: [] })] },
      'POST /api/songs/3/arrangements': {
        status: 201,
        json: arrangementJson({ name: 'Acoustic', key: 'A' }),
      },
    });
    vi.stubGlobal('fetch', api.fetch);
    render(<SongsPage />);
    const form = within(
      await screen.findByRole('form', { name: 'Add an arrangement of Amazing Grace' }),
    );
    fireEvent.change(form.getByLabelText('Name', { exact: false }), {
      target: { value: 'Acoustic' },
    });
    fireEvent.change(form.getByLabelText('Default key', { exact: false }), {
      target: { value: 'a' },
    });
    fireEvent.change(form.getByLabelText('Tempo (BPM)'), { target: { value: '68' } });
    fireEvent.change(form.getByLabelText('Length', { exact: false }), {
      target: { value: '4:10' },
    });
    fireEvent.click(form.getByRole('button', { name: 'Add arrangement' }));
    expect(await screen.findByText('Added the arrangement Acoustic.')).toBeTruthy();
    expect(api.sent.find((request) => request.method === 'POST')?.body).toEqual({
      name: 'Acoustic',
      key: 'A',
      tempo_bpm: 68,
      meter: '4/4',
      length_seconds: 250,
      sequence: '',
      chart: '',
    });
  });
});
