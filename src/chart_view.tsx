/** A chord chart as musicians read it: each section under its label, chords over the lyrics. */
import type { ReactElement } from 'react';

import type { Chart, ChartLine } from './chordpro';

function ChartLineView({ line }: { readonly line: ChartLine }): ReactElement {
  switch (line.kind) {
    case 'blank':
      return <div className="chart-gap" />;
    case 'comment':
      return <p className="chart-comment">{line.text}</p>;
    case 'lyrics': {
      const hasChords = line.segments.some((segment) => segment.chord !== null);
      const hasLyrics = line.segments.some((segment) => segment.lyric.trim() !== '');
      if (!hasChords) {
        return (
          <p className="chart-line">{line.segments.map((segment) => segment.lyric).join('')}</p>
        );
      }
      return (
        <p className={hasLyrics ? 'chart-line' : 'chart-line chords-only'}>
          {line.segments.map((segment) => (
            <span key={segment.start} className="chart-segment">
              <span className="chart-chord">{segment.chord ?? ''}</span>
              {hasLyrics ? <span className="chart-lyric">{segment.lyric}</span> : null}
            </span>
          ))}
        </p>
      );
    }
  }
}

interface ChartViewProps {
  readonly chart: Chart;
  /** The level of the section labels' headings, under the heading the chart sits in. */
  readonly headingLevel: 3 | 4;
}

export function ChartView({ chart, headingLevel }: ChartViewProps): ReactElement {
  if (chart.sections.length === 0) {
    return <p className="muted">No chart yet.</p>;
  }
  const Heading = headingLevel === 3 ? 'h3' : 'h4';
  return (
    <div className="chord-chart">
      {chart.sections.map((section) => (
        <section key={section.line} className="chart-section">
          {section.label === null ? null : (
            <Heading className="chart-label">{section.label}</Heading>
          )}
          {section.lines.map((line) => (
            <ChartLineView key={line.line} line={line} />
          ))}
        </section>
      ))}
    </div>
  );
}
