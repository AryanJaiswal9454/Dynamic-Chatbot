import { useEffect, useState } from 'react';
import * as api from './api';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getAnalytics().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="dash"><p className="error">{error}</p></div>;
  if (!data) return <div className="dash"><p className="muted">Loading analytics…</p></div>;

  const maxDay = Math.max(1, ...data.daily.map((d) => d.messages));
  const sentTotal = Math.max(1, data.sentiment.positive + data.sentiment.neutral + data.sentiment.negative);
  const rated = data.helpful + data.not_helpful;
  const satisfaction = rated ? Math.round((data.helpful / rated) * 100) : null;

  const facts = [
    ['Registered users', data.users],
    ['Conversations', data.conversations],
    ['Messages in total', data.messages],
    ['Questions today', data.messages_today],
    ['Average reply time', `${(data.avg_response_ms / 1000).toFixed(1)} s`],
    ['Failed replies', `${data.fallback_rate}%`],
    ['Rated helpful', satisfaction === null ? 'No ratings yet' : `${satisfaction}% (${rated} ratings)`],
  ];

  return (
    <div className="dash">
      <h2>Questions per day, last 14 days</h2>
      <div className="bars" role="img" aria-label="Questions per day">
        {data.daily.map((d) => (
          <div key={d.date} className="bar-col" title={`${d.date}: ${d.messages}`}>
            <span className="bar-n">{d.messages || ''}</span>
            <div className="bar" style={{ height: `${(d.messages / maxDay) * 100}%` }} />
            <span className="bar-d">{d.date.slice(8)}</span>
          </div>
        ))}
      </div>

      <div className="dash-cols">
        <section>
          <h2>Overview</h2>
          <dl className="facts">
            {facts.map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
        </section>
        <section>
          <h2>How users sound</h2>
          {['positive', 'neutral', 'negative'].map((k) => (
            <div key={k} className="sent-row">
              <span>{k[0].toUpperCase() + k.slice(1)}</span>
              <div className="sent-track"><div className={`sent-fill ${k}`} style={{ width: `${(data.sentiment[k] / sentTotal) * 100}%` }} /></div>
              <b>{data.sentiment[k]}</b>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
