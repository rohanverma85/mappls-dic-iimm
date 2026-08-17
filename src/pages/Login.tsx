import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, Landmark, LoaderCircle, ShieldCheck, Smartphone, UserCheck, Wrench } from 'lucide-react';
import type { Role, Session, User } from '../../shared/types';
import { ROLE_LABELS } from '../../shared/types';
import { api, post, storeSession } from '../api';
import { Logo } from '../components/Logo';
import { Button, Card } from '../components/UI';

const roleIcons = { tenant_admin:ShieldCheck, authority:Landmark, maker:Wrench, checker:UserCheck, citizen:Smartphone };

export default function Login({ onBack, onLogin }: { onBack:()=>void; onLogin:(session:Session)=>void }) {
  const [users,setUsers] = useState<User[]>([]);
  const [selected,setSelected] = useState<Role>('authority');
  const [loading,setLoading] = useState(true);
  const [signingIn,setSigningIn] = useState(false);
  const [error,setError] = useState('');
  useEffect(()=>{ api<User[]>('/api/demo-users').then(setUsers).catch((e)=>setError(e.message)).finally(()=>setLoading(false)); },[]);
  const chosen = users.find((u)=>u.role===selected);
  async function signIn() {
    if (!chosen) return;
    setSigningIn(true); setError('');
    try { const session = await post<Session>('/api/auth/login',{userId:chosen.id}); storeSession(session); onLogin(session); }
    catch (e) { setError(e instanceof Error ? e.message:'Unable to sign in'); }
    finally { setSigningIn(false); }
  }
  return <div className="login-page"><div className="login-brand-panel"><button className="back-link" onClick={onBack}><ArrowLeft size={17}/> Back to website</button><div><Logo inverse/><span className="login-kicker">Unified infrastructure operations</span><h1>Every asset. Every action. One accountable platform.</h1><p>Choose a seeded role to experience the exact Maker–Checker–Authority and Citizen journeys from the IIMM PRD.</p></div><div className="login-chain"><span><Wrench/> Maker acts</span><i/><span><UserCheck/> Checker verifies</span><i/><span><Landmark/> Authority governs</span></div></div>
    <main className="login-main"><div className="login-box"><span className="eyebrow">PROTOTYPE ACCESS</span><h2>Choose your role</h2><p>All accounts use seeded, tenant-isolated demonstration data.</p>
      {loading ? <div className="login-loading"><LoaderCircle className="spin"/> Loading secure demo accounts…</div> : <div className="role-selector">{(Object.keys(ROLE_LABELS) as Role[]).map((role)=>{const Icon=roleIcons[role];const user=users.find((u)=>u.role===role);return <button key={role} className={selected===role?'selected':''} onClick={()=>setSelected(role)} disabled={!user}><Icon/><span><b>{ROLE_LABELS[role]}</b><small>{role==='tenant_admin'?'Digital India platform console':user?.designation}</small></span>{selected===role&&<CheckCircle2 className="role-check"/>}</button>})}</div>}
      {chosen && <Card className="login-account"><span className="avatar">{chosen.name.split(' ').map((n)=>n[0]).join('')}</span><div><small>DEMO ACCOUNT</small><b>{chosen.name}</b><span>{chosen.email || chosen.mobile}</span></div><Building2 size={20}/></Card>}
      {error && <p className="form-error">{error}</p>}
      <Button className="login-submit" onClick={signIn} disabled={!chosen||signingIn}>{signingIn?<LoaderCircle className="spin" size={18}/>:<>Continue as {selected==='tenant_admin'?'Tenant Admin':ROLE_LABELS[selected].replace('External User · ','')} <ArrowRight size={18}/></>}</Button>
      <p className="login-note"><ShieldCheck size={15}/> Prototype authentication only. Production supports tenant-configurable SSO/credentials, Aadhaar for External Users and OTP for Citizens.</p>
    </div></main></div>;
}
