import { useEffect, useState } from 'react';
import { ArrowRight, BarChart3, Building2, Check, ClipboardCheck, CloudOff, Construction, Landmark, MapPin, Menu, PanelsTopLeft, ShieldCheck, Smartphone, Users, Wrench, X } from 'lucide-react';
import { ALL_MODULES } from '../../shared/types';
import { Logo } from '../components/Logo';
import { Button, Card } from '../components/UI';

const moduleIcons = [Users,ClipboardCheck,Building2,Check,ClipboardCheck,Construction,Landmark,ShieldCheck,Smartphone,BarChart3,PanelsTopLeft,ClipboardCheck,MapPin];

export default function Marketing({ onLaunch }: { onLaunch:()=>void }) {
  const [menuOpen,setMenuOpen] = useState(false);
  useEffect(() => { document.title = 'IIMM Platform · Infrastructure, managed end to end'; },[]);
  return <div className="marketing">
    <header className="marketing-nav shell-width">
      <Logo/><nav className={menuOpen ? 'open':''}>
        <a href="#features" onClick={()=>setMenuOpen(false)}>Features</a><a href="#benefits" onClick={()=>setMenuOpen(false)}>Benefits</a><a href="#roles" onClick={()=>setMenuOpen(false)}>Who it’s for</a><a href="#security" onClick={()=>setMenuOpen(false)}>Trust</a>
        <Button onClick={onLaunch}>Open platform <ArrowRight size={16}/></Button>
      </nav>
      <button className="nav-toggle" onClick={()=>setMenuOpen(!menuOpen)} aria-label="Toggle navigation">{menuOpen ? <X/>:<Menu/>}</button>
    </header>

    <main>
      <section className="hero shell-width">
        <div className="hero-copy"><span className="hero-pill">One platform · any infrastructure body · zero code changes</span>
          <h1>Plan, inspect, maintain and report on <em>public infrastructure</em> — configured to your agency</h1>
          <p>Highways, buildings, streetlights, pipelines — the workflow is identical: plan, inspect, fix, pay, and let citizens report and track issues. Only the vocabulary and SLA rules change per tenant.</p>
          <div className="hero-actions"><Button onClick={onLaunch}>Explore the working platform <ArrowRight size={17}/></Button><Button variant="secondary" onClick={()=>document.querySelector('#features')?.scrollIntoView({behavior:'smooth'})}>See every capability</Button></div>
          <div className="trust-row"><span><Check/> Multi-tenant by design</span><span><Check/> Auditable approvals</span><span><Check/> Field-ready mobile UX</span></div>
        </div>
        <div className="hero-visual" aria-label="IIMM operations overview preview">
          <div className="hero-window"><div className="window-bar"><i/><i/><i/><span>Operations dashboard</span></div><div className="window-body"><aside><div className="mini-logo">DI</div>{[1,2,3,4,5,6].map((n)=><b key={n} style={{width:`${44+n*5}%`}}/> )}</aside><div className="window-main"><div className="visual-title"><span/><span/></div><div className="visual-kpis">{['428','312','18','46'].map((n,i)=><div key={n}><strong>{n}</strong><small>{['Projects','Defects','SLA risks','Payments'][i]}</small></div>)}</div><div className="visual-grid"><div className="visual-map"><span className="map-road r1"/><span className="map-road r2"/><span className="map-pin p1"/><span className="map-pin p2"/><span className="map-pin p3"/></div><div className="visual-list">{[78,52,91,34].map((n)=><div key={n}><span/><p><b/><i style={{width:`${n}%`}}/></p></div>)}</div></div></div></div></div>
          <div className="floating-card floating-one"><ShieldCheck/><span><b>3-step approval</b><small>Maker → Checker → Authority</small></span></div>
          <div className="floating-card floating-two"><CloudOff/><span><b>Offline capture</b><small>Syncs safely on reconnect</small></span></div>
        </div>
      </section>

      <section className="impact-strip"><div className="shell-width impact-grid">{[['13','configurable modules'],['5','clearly separated user types'],['100%','tenant-isolated data'],['1','citizen-to-resolution trail']].map(([n,l])=><div key={l}><strong>{n}</strong><span>{l}</span></div>)}</div></section>

      <section id="features" className="section shell-width"><div className="marketing-heading"><span className="eyebrow">Complete operating system</span><h2>Built once. Configured for every tenant.</h2><p>Every core workflow in the PRD is connected, role-aware, and traceable from request to resolution.</p></div>
        <div className="module-grid">{ALL_MODULES.map((name,index)=>{const Icon=moduleIcons[index];return <Card key={name} className="module-card"><span className="module-icon"><Icon size={21}/></span><h3>{name}</h3><p>{moduleDescriptions[name]}</p></Card>})}</div>
      </section>

      <section id="benefits" className="section benefit-section"><div className="shell-width split-section"><div><span className="eyebrow light">From configuration to field execution</span><h2>Govern with confidence. Move work faster.</h2><p>Purpose-built separation of duties keeps high-risk actions accountable without slowing down teams in the field.</p><ul className="benefit-list"><li><ShieldCheck/><span><b>Clean approval chains</b>Payment claims require three distinct people; defect closure and citizen validation require Maker–Checker verification.</span></li><li><Wrench/><span><b>Asset models without code changes</b>Each tenant defines its own attributes, inspection checklist, severity logic, and SLAs.</span></li><li><CloudOff/><span><b>Resilient field work</b>Capture inspections, defects, attendance and media offline, then sync with explicit conflict review.</span></li><li><MapPin/><span><b>Citizens close the loop</b>Geo-tagged reporting, duplicate linking, live statuses, notifications and feedback build public trust.</span></li></ul></div>
        <div className="workflow-card"><header><span>LIVE WORKFLOW</span><b>Citizen report → verified resolution</b></header>{['OTP report & geo-tag','Duplicate detection','Checker validation','Maker assignment','ATR verification','Citizen feedback'].map((step,i)=><div className="workflow-step" key={step}><i>{i+1}</i><span>{step}</span><Check/></div>)}</div>
      </div></section>

      <section id="roles" className="section shell-width"><div className="marketing-heading"><span className="eyebrow">One platform, the right view for everyone</span><h2>Five user types. No blurred accountability.</h2></div><div className="role-grid">{roles.map(({name,label,text,icon:Icon})=><Card className="role-card" key={name}><Icon/><span>{label}</span><h3>{name}</h3><p>{text}</p></Card>)}</div></section>

      <section id="security" className="section shell-width"><div className="assurance"><div><span className="eyebrow">Designed for public-sector accountability</span><h2>Every decision has an actor, a role and a timestamp.</h2><p>Strict tenant isolation, scoped permissions, audited platform access, configurable SLAs and searchable activity logs give oversight teams a trustworthy record.</p></div><div className="assurance-points"><span><ShieldCheck/> Tenant-isolated operational data</span><span><ClipboardCheck/> CAG-style activity history</span><span><Users/> Role and geography permissions</span><span><CloudOff/> Server-wins conflict handling</span></div></div></section>

      <section className="cta-section"><div className="shell-width"><span>INTEGRATED INFRASTRUCTURE MANAGEMENT & MAINTENANCE</span><h2>See the complete ecosystem in action.</h2><p>Use seeded accounts to walk through Tenant Admin, Authority, Maker, Checker and Citizen journeys.</p><Button onClick={onLaunch}>Launch the IIMM Platform <ArrowRight size={18}/></Button></div></section>
    </main>
    <footer className="marketing-footer shell-width"><Logo/><p>Prototype v1.2 · Built for configurable public infrastructure operations.</p><button onClick={onLaunch}>Platform login →</button></footer>
  </div>;
}

const moduleDescriptions: Record<string,string> = {
  'Access & Onboarding':'Provision tenants, hierarchies, designations, roles and permission scopes.',
  'Project Management':'Create projects, map stakeholders, track milestones and documents.',
  'Asset Management':'Configure asset schemas and maintain a live infrastructure register.',
  'Attendance':'Geo-fenced mobile marking for Makers with oversight for Checker and Authority.',
  'Inspections':'Joint and requested inspections using asset-specific checklists.',
  'Defect Management':'Validate, assign, rectify and verify defects against configurable SLAs.',
  'Payments':'Invoice-to-disbursement with Maker–Checker–Authority separation.',
  'Helpdesk':'SLA-based ticketing, self-serve knowledge and guided support.',
  'Citizen App':'Low-friction reporting, duplicate detection, tracking and feedback.',
  'Dashboards & Reports':'Executive, operations, agency and citizen insight views.',
  'Notifications':'Role-routed action, status, overdue, approval and escalation alerts.',
  'Activity Log':'Immutable-style action history for governance and audit.',
  'Search':'Permission-aware discovery across every operational entity.',
};

const roles = [
  { name:'Tenant Administrator', label:'DIGITAL INDIA', text:'Provisions, configures and supports every tenant from a separately audited platform console.', icon:PanelsTopLeft },
  { name:'Authority User', label:'GOVERN', text:'Plans projects, manages users, monitors SLAs and gives final payment authorisation.', icon:Landmark },
  { name:'External User · Maker', label:'EXECUTE', text:'Marks attendance, conducts field work, resolves defects and submits claims.', icon:Construction },
  { name:'External User · Checker', label:'VERIFY', text:'Validates citizen issues, co-inspects, verifies ATRs and payment claims.', icon:ClipboardCheck },
  { name:'Citizen User', label:'REPORT', text:'Reports geo-tagged infrastructure problems and tracks every resolution step.', icon:Smartphone },
];
