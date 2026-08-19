import { useEffect, useState, type PropsWithChildren } from 'react';
import { Bell, Building2, ChevronDown, CircleHelp, ClipboardCheck, Construction, CreditCard, FileBarChart, FolderKanban, Gauge, Landmark, LogOut, MapPinned, Menu, PackageSearch, PanelLeftClose, Search, Settings2, ShieldCheck, Smartphone, UserCog, Users, Wrench, X } from 'lucide-react';
import type { Role, Session } from '../../shared/types';
import { ROLE_LABELS } from '../../shared/types';
import { api } from '../api';
import { Logo } from './Logo';

export type AppPage = 'dashboard'|'tenants'|'onboarding'|'users'|'projects'|'assets'|'gis'|'attendance'|'inspections'|'defects'|'payments'|'citizen'|'helpdesk'|'reports'|'notifications'|'activity'|'search';

const navByRole: Record<Role, { group:string; items:{page:AppPage; label:string; icon:typeof Gauge}[] }[]> = {
  tenant_admin:[
    {group:'PLATFORM',items:[{page:'dashboard',label:'Cross-tenant overview',icon:Gauge},{page:'tenants',label:'Tenant management',icon:Building2},{page:'onboarding',label:'Provision new tenant',icon:Settings2},{page:'gis',label:'GIS oversight',icon:MapPinned},{page:'activity',label:'Access & activity log',icon:ShieldCheck},{page:'reports',label:'Platform reports',icon:FileBarChart}]},
    {group:'TOOLS',items:[{page:'notifications',label:'Notifications',icon:Bell},{page:'search',label:'Global search',icon:Search},{page:'helpdesk',label:'Support desk',icon:CircleHelp}]},
  ],
  authority:[
    {group:'OPERATIONS',items:[{page:'dashboard',label:'Operations dashboard',icon:Gauge},{page:'projects',label:'Projects',icon:FolderKanban},{page:'assets',label:'Assets',icon:PackageSearch},{page:'gis',label:'Map & GIS',icon:MapPinned},{page:'inspections',label:'Inspections',icon:ClipboardCheck},{page:'defects',label:'Defects',icon:Construction},{page:'payments',label:'Payment approvals',icon:CreditCard}]},
    {group:'GOVERNANCE',items:[{page:'users',label:'Users & access',icon:Users},{page:'citizen',label:'Citizen insights',icon:Smartphone},{page:'reports',label:'Reports',icon:FileBarChart},{page:'activity',label:'Activity log',icon:ShieldCheck}]},
    {group:'TOOLS',items:[{page:'notifications',label:'Notifications',icon:Bell},{page:'search',label:'Search',icon:Search},{page:'helpdesk',label:'Helpdesk',icon:CircleHelp}]},
  ],
  maker:[
    {group:'MY FIELD WORK',items:[{page:'dashboard',label:'My work',icon:Gauge},{page:'attendance',label:'Mark attendance',icon:UserCog},{page:'inspections',label:'Inspections',icon:ClipboardCheck},{page:'defects',label:'Defects & ATR',icon:Wrench},{page:'payments',label:'My payment claims',icon:CreditCard}]},
    {group:'TOOLS',items:[{page:'assets',label:'Assigned assets',icon:PackageSearch},{page:'gis',label:'Field map',icon:MapPinned},{page:'notifications',label:'Notifications',icon:Bell},{page:'helpdesk',label:'Helpdesk',icon:CircleHelp},{page:'search',label:'Search',icon:Search}]},
  ],
  checker:[
    {group:'VERIFICATION',items:[{page:'dashboard',label:'Verification queue',icon:Gauge},{page:'inspections',label:'Inspections',icon:ClipboardCheck},{page:'defects',label:'Defect validation',icon:Construction},{page:'attendance',label:'Attendance oversight',icon:UserCog},{page:'payments',label:'Payment verification',icon:CreditCard}]},
    {group:'TOOLS',items:[{page:'projects',label:'Assigned projects',icon:FolderKanban},{page:'gis',label:'GIS verification map',icon:MapPinned},{page:'reports',label:'Agency reports',icon:FileBarChart},{page:'notifications',label:'Notifications',icon:Bell},{page:'helpdesk',label:'Helpdesk',icon:CircleHelp},{page:'search',label:'Search',icon:Search}]},
  ],
  citizen:[
    {group:'MY IIMM',items:[{page:'dashboard',label:'My overview',icon:Gauge},{page:'citizen',label:'Report an issue',icon:Smartphone},{page:'notifications',label:'Updates',icon:Bell},{page:'helpdesk',label:'Help & support',icon:CircleHelp}]},
  ],
};

export default function Shell({ session, page, onNavigate, onLogout, children }: PropsWithChildren<{ session:Session; page:AppPage; onNavigate:(p:AppPage)=>void; onLogout:()=>void }>) {
  const [open,setOpen] = useState(false);
  const [collapsed,setCollapsed] = useState(false);
  const [unread,setUnread] = useState(0);
  useEffect(()=>{ api<{read:boolean}[]>('/api/notifications').then((items)=>setUnread(items.filter((n)=>!n.read).length)).catch(()=>{}); },[page]);
  const nav = navByRole[session.user.role];
  const pageLabel = nav.flatMap((g)=>g.items).find((item)=>item.page===page)?.label ?? page;
  function navigate(next:AppPage) { onNavigate(next); setOpen(false); }
  return <div className={`app-shell ${collapsed?'nav-collapsed':''}`}>
    <aside className={`sidebar ${open?'mobile-open':''}`}><div className="sidebar-brand"><Logo compact={collapsed}/><button className="icon-btn sidebar-close" onClick={()=>setOpen(false)}><X/></button></div>
      <div className="tenant-switch"><span className="tenant-logo">{session.tenant?.shortName.slice(0,2) ?? 'DI'}</span>{!collapsed&&<><div><small>{session.user.role==='tenant_admin'?'PLATFORM CONSOLE':'ACTIVE TENANT'}</small><b>{session.tenant?.shortName ?? 'Digital India'}</b></div><ChevronDown size={16}/></>}</div>
      <nav className="sidebar-nav">{nav.map((group)=><div className="nav-group" key={group.group}>{!collapsed&&<span>{group.group}</span>}{group.items.map(({page:target,label,icon:Icon})=><button key={target} className={page===target?'active':''} onClick={()=>navigate(target)} title={collapsed?label:undefined}><Icon size={19}/>{!collapsed&&<span>{label}</span>}{target==='notifications'&&unread>0&&<i>{unread}</i>}</button>)}</div>)}</nav>
      <button className="collapse-btn" onClick={()=>setCollapsed(!collapsed)}><PanelLeftClose size={18}/>{!collapsed&&'Collapse navigation'}</button>
    </aside>
    {open&&<button className="mobile-scrim" onClick={()=>setOpen(false)} aria-label="Close navigation"/>}
    <div className="app-column"><header className="topbar"><button className="icon-btn mobile-menu" onClick={()=>setOpen(true)} aria-label="Open navigation"><Menu/></button><div className="crumb"><span>{ROLE_LABELS[session.user.role]}</span><b>{pageLabel}</b></div><div className="topbar-actions"><button className="icon-btn notification-button" onClick={()=>navigate('notifications')} aria-label="Notifications"><Bell size={19}/>{unread>0&&<i>{unread}</i>}</button><div className="user-menu"><span>{session.user.name.split(' ').map((n)=>n[0]).join('').slice(0,2)}</span><div><b>{session.user.name}</b><small>{session.user.designation}</small></div></div><button className="icon-btn" onClick={onLogout} aria-label="Log out"><LogOut size={19}/></button></div></header>
      <main className="app-main">{children}</main>
    </div>
  </div>;
}

export const roleGlyph = { tenant_admin:ShieldCheck, authority:Landmark, maker:Wrench, checker:ClipboardCheck, citizen:Smartphone };
