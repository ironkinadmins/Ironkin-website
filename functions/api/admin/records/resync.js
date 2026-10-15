import { hybridKv } from '../../../_hybridKv.js';
import { getSession, isStaffSession } from '../../_auth.js';
import { syncRecordEmbeds } from '../../../_recordsAutoSync.js';

// Admin recovery action for missed Discord updates. Never changes archived results.
export async function onRequestPost({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) return Response.json({ error: 'Staff only.' }, { status: 403 });
  try {
    const raw = await hybridKv(env, 'drops').get('events:archive');
    const archive = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(archive)) throw new Error('Archive is invalid.');
    const results = await syncRecordEmbeds(env, archive);
    return Response.json({ success: true, results }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ success: false, error: String(error?.message || error) }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
