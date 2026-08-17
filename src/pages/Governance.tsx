import { useState } from 'react';
import { Activity as ActivityIcon, Bell, Check, ClipboardList, Download, FileBarChart, FileSpreadsheet, Search as SearchIcon, ShieldCheck } from 'lucide-react';
import type { Activity, Notification, Session } from '../../shared/types';
import { api, post } from '../api';
import { Badge, Button, Card, EmptyState, Loading, SectionHeader } from '../components/UI';
import { ErrorBanner, formatDate, toneFor, useData } from './shared';

const reports=[
  {id:'defects',name:'Defect Lifecycle & SLA',type:'Operations',description:'Citizen/internal source, severity, state, due date and closure performance.'},
  {id:'payments',name:'Payment Approval Audit',type:'Financial controls',description:'Invoice amount and the Maker–Checker–Authority approval state.'},
  {id:'activity',name:'User Activity & Audit Log',type:'Governance',description:'Actor role, action, entity, timestamp and accountability detail.'},
];

export function ReportsPage() {
  const [busy,setBusy]=useState('');const [error,setError]=useState('');
  async function download(id:string){setBusy(id);setError('');try{const blob=await api<string>(`/api/reports/${id}.csv`);const url=URL.createObjectURL(new Blob([blob],{type:'text/csv'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=`iimm-${id}-report.csv`;anchor.click();URL.revokeObjectURL(url);}catch(e){setError(e instanceof Error?e.message:'Unable to export report');}finally{setBusy('');}}
  return <div className="page-stack"><ErrorBanner message={error}/><SectionHeader eyebrow="DASHBOARDS & REPORTS" title="Reports" description="Agency performance, citizen complaints, helpdesk/SLA and audit reports. CSV proves the export pattern for this prototype."/><div className="report-grid">{reports.map((report)=><Card className="report-card" key={report.id}><header><span><FileBarChart/></span><Badge tone="info">{report.type}</Badge></header><h2>{report.name}</h2><p>{report.description}</p><footer><span>Updated from live prototype data</span><Button variant="secondary" onClick={()=>download(report.id)} disabled={busy===report.id} icon={report.id==='payments'?<FileSpreadsheet size={16}/>:<Download size={16}/>}>{busy===report.id?'Preparing…':'Export CSV'}</Button></footer></Card>)}</div><Card className="report-note"><ShieldCheck/><div><b>Scope-aware exports</b><p>Tenant Administrators export cross-tenant records. Authority and Checker users export only records in their active tenant and permission scope.</p></div></Card></div>;
}

export function NotificationsPage() {
  const {data,setData,loading,error}=useData<Notification[]>('/api/notifications',[]);
  async function markAll(){await post('/api/notifications/read-all',{});setData(data.map((n)=>({...n,read:true})));}
  if(loading)return <Loading label="Loading notifications"/>;
  return <div className="page-stack"><ErrorBanner message={error}/><SectionHeader eyebrow="ROLE-ROUTED ALERTS" title="Notifications" description="Assignments, pending actions, approvals, overdue items and SLA breaches reach the correct user type." action={<Button variant="secondary" onClick={markAll} disabled={!data.some((n)=>!n.read)} icon={<Check size={16}/>}>Mark all read</Button>}/>{data.length?<div className="notification-list">{data.map((n)=><Card className={`notification-card ${n.read?'':'unread'}`} key={n.id}><span className={`notification-icon ${n.kind}`}><Bell/></span><div><header><h2>{n.title}</h2><Badge tone={n.read?'neutral':'info'}>{n.read?'Read':'New'}</Badge></header><p>{n.message}</p><time>{formatDate(n.createdAt)}</time></div></Card>)}</div>:<EmptyState icon={<Bell/>} title="You’re all caught up" text="New action and status alerts will appear here."/>}</div>;
}

export function ActivityPage({session}:{session:Session}) {
  const {data,loading,error}=useData<Activity[]>('/api/activities',[]);const [filter,setFilter]=useState('');
  if(loading)return <Loading label="Loading audit trail"/>;
  const filtered=data.filter((a)=>!filter||`${a.action} ${a.entityType} ${a.detail} ${a.actorRole}`.toLowerCase().includes(filter.toLowerCase()));
  return <div className="page-stack"><ErrorBanner message={error}/><SectionHeader eyebrow={session.user.role==='tenant_admin'?'SEPARATELY AUDITED PLATFORM ACCESS':'TENANT ACCOUNTABILITY'} title="Activity Log" description="Every action carries an actor, user type, entity and server timestamp for audit traceability."/><Card><div className="table-toolbar"><label><SearchIcon size={17}/><input value={filter} onChange={(e)=>setFilter(e.target.value)} placeholder="Filter audit events…"/></label><Badge tone="success">{filtered.length} immutable-style events</Badge></div><div className="table-wrap"><table><thead><tr><th>Timestamp</th><th>Actor role</th><th>Action</th><th>Entity</th><th>Detail</th></tr></thead><tbody>{filtered.map((a)=><tr key={a.id}><td>{formatDate(a.timestamp)}</td><td><Badge tone={a.actorRole==='tenant_admin'?'danger':a.actorRole==='authority'?'info':a.actorRole==='checker'?'success':'neutral'}>{a.actorRole.replace('_',' ')}</Badge></td><td><b className="mono">{a.action}</b></td><td>{a.entityType} · {a.entityId}</td><td>{a.detail}</td></tr>)}</tbody></table></div></Card></div>;
}

interface SearchResult {type:string;id:string;title:string;subtitle:string}
export function SearchPage() {
  const [query,setQuery]=useState('');const [results,setResults]=useState<SearchResult[]>([]);const [loading,setLoading]=useState(false);const [searched,setSearched]=useState(false);const [error,setError]=useState('');
  async function search(){if(query.trim().length<2)return;setLoading(true);setSearched(true);setError('');try{setResults(await api<SearchResult[]>(`/api/search?q=${encodeURIComponent(query)}`));}catch(e){setError(e instanceof Error?e.message:'Search failed');}finally{setLoading(false);}}
  return <div className="page-stack search-page"><ErrorBanner message={error}/><SectionHeader eyebrow="PERMISSION-AWARE DISCOVERY" title="Centralised Search" description="Find projects, assets, users, inspections, defects, citizen issues and helpdesk tickets within your role scope."/><div className="big-search"><SearchIcon/><input autoFocus value={query} onChange={(e)=>setQuery(e.target.value)} onKeyDown={(e)=>{if(e.key==='Enter')void search();}} placeholder="Search by ID, name, location, issue or user…"/><Button onClick={search} disabled={query.trim().length<2||loading}>{loading?'Searching…':'Search'}</Button></div>{searched&&results.length===0&&!loading?<EmptyState icon={<SearchIcon/>} title="No scoped results" text="Try another ID, location or keyword. Results are filtered by your role and tenant."/>:<div className="search-results">{results.map((r)=><Card key={`${r.type}-${r.id}`}><span className="result-icon">{r.type==='Project'?<ClipboardList/>:r.type==='Defect'?<ActivityIcon/>:<FileBarChart/>}</span><div><Badge tone={toneFor(r.type)}>{r.type}</Badge><h2>{r.title}</h2><p>{r.subtitle}</p></div><span className="mono">{r.id}</span></Card>)}</div>}</div>;
}
