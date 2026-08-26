import { strict as assert } from 'node:assert';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
assert.ok(url && publishableKey, 'Supabase public environment is missing');

const client = () => createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const sender = client();
const receiver = client();
const topic = `duel-gestures-qa-${crypto.randomUUID()}`;
let received = null;
const receiverChannel = receiver.channel(topic, { config: { broadcast: { self: false, ack: false } } })
  .on('broadcast', { event: 'gesture' }, ({ payload }) => { received = payload; });
const senderChannel = sender.channel(topic, { config: { broadcast: { self: false, ack: false } } });

const subscribe = (channel) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('Gesture Realtime subscription timeout')), 6000);
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') { clearTimeout(timeout); resolve(); }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(timeout); reject(new Error(`Gesture Realtime ${status}`)); }
  });
});

try {
  await Promise.all([subscribe(receiverChannel), subscribe(senderChannel)]);
  await senderChannel.send({ type: 'broadcast', event: 'gesture', payload: { kind: 'release', x: 42, y: 61 } });
  for (let attempt = 0; attempt < 40 && !received; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(received, { kind: 'release', x: 42, y: 61 });
  console.log('✓ two-client opponent gesture broadcast verified');
} finally {
  await Promise.all([sender.removeChannel(senderChannel), receiver.removeChannel(receiverChannel)]);
}
