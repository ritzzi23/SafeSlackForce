import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, ExternalLink, Download } from 'lucide-react';
import type { IncidentSnapshot } from '@incidentos/contracts';
import { safeUrl } from './api';

export default function IncidentShare({ snapshot }: { snapshot: IncidentSnapshot }) {
  const url = safeUrl(snapshot.slackThreadUrl);
  const [qr, setQr] = useState(''), [notice, setNotice] = useState('');
  useEffect(() => {
    let cancelled = false; setQr('');
    if (url) void QRCode.toDataURL(url, { width: 320, margin: 4, errorCorrectionLevel: 'M' }).then(value => { if (!cancelled) setQr(value); }).catch(() => { if (!cancelled) setNotice('QR unavailable. Use the thread link below.'); });
    return () => { cancelled = true; };
  }, [url]);
  if (!url) return <p>Connect a Slack incident to create its shared thread link.</p>;
  return <div className="incident-share">
    <p>One shared thread for {snapshot.incidentId}. Scan to add observations, photos, or corrections. Agents process new details automatically.</p>
    {qr && <img className="incident-qr" src={qr} alt={`QR code to join the Slack thread for ${snapshot.incidentId}`} width={240} height={240} />}
    <a className="primary-button" href={url} target="_blank" rel="noreferrer">Join incident thread <ExternalLink size={15} /></a>
    <label htmlFor="incident-share-url">Shared thread link</label>
    <input id="incident-share-url" value={url} readOnly onFocus={e => e.target.select()} />
    <div className="share-actions">
      <button onClick={() => void navigator.clipboard.writeText(url).then(() => setNotice('Thread link copied.')).catch(() => setNotice('Select and copy the link above.'))}><Copy size={14} /> Copy link</button>
      {qr && <a href={qr} download={`${snapshot.incidentId}-join.png`}><Download size={14} /> Download QR</a>}
    </div>
    <p className="field-hint">Participants need access to this Slack workspace and channel. Reply in this thread so every update stays attached to the same incident.</p>
    <p role="status">{notice}</p>
  </div>;
}
