import { useEffect, useState } from 'react';
import { api, type Row } from '../api';
import AnalysisView from '../shared/Analysis';
import { ErrorBox, Loading, errMsg, useLoad, useToast } from '../ui';

/** "My progress": topic strengths from every published exam + an AI summary (made automatically the first time). */
export default function Progress() {
  const toast = useToast(); const { data, loading, error, reload, setData } = useLoad<Row>(() => api.get('/portal/analysis'), []);
  const [busy, setBusy] = useState(false); const [tried, setTried] = useState(false);
  const make = async () => { setBusy(true); try { const r = await api.post('/portal/analysis/summary'); setData(d => (d ? { ...d, ...r } : d)); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); } };
  useEffect(() => { if (data?.has_data && !data.summary && !tried) { setTried(true); make(); } }, [data]);   // eslint-disable-line
  if (loading) return <Loading />; if (error || !data) return <ErrorBox msg={error} retry={reload} />;
  return <><div style={{ marginBottom: 14 }}><h2 style={{ fontSize: 21, margin: 0 }}>My progress</h2><p className="muted" style={{ margin: '2px 0 0' }}>How you are doing, topic by topic, across your exams.</p></div>
    <AnalysisView a={data} onGenerate={make} busy={busy} /></>;
}
