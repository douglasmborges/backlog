// Leaderboard access through the instance Table API, using the signed-in
// user's session (aiuxFetch adds the session token).
import {aiuxFetch} from '@servicenow/aiux/aiux-components-core';

export const SCORE_TABLE = 'x_2302769_backlog_score';

function topParams(limit) {
  return new URLSearchParams({
    sysparm_fields: 'player_name,time_ms,deaths',
    sysparm_query: 'ORDERBYtime_ms^ORDERBYdeaths',
    sysparm_limit: String(limit)
  });
}

function mapRows(json) {
  return (json?.result || []).map(r => ({
    name: r.player_name,
    timeMs: Number(r.time_ms) || 0,
    deaths: Number(r.deaths) || 0
  }));
}

export async function fetchTop(limit = 10) {
  const res = await aiuxFetch(`/api/now/table/${SCORE_TABLE}?${topParams(limit)}`);
  if (!res.ok) throw new Error(`ranking ${res.status}`);
  return mapRows(await res.json());
}

export async function submitScore({name, timeMs, deaths}) {
  const res = await aiuxFetch(`/api/now/table/${SCORE_TABLE}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Accept: 'application/json'},
    body: JSON.stringify({
      player_name: String(name).slice(0, 40),
      time_ms: Math.round(timeMs),
      deaths: Math.round(deaths)
    })
  });
  if (!res.ok) throw new Error(`submit ${res.status}`);
  return res.json();
}

export function formatTime(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
