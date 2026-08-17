import type { PropsWithChildren, ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, LoaderCircle, X, XCircle } from 'lucide-react';
import type { StatusTone } from '../../shared/types';

export function Button({ children, variant='primary', icon, className='', ...props }: PropsWithChildren<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?:'primary'|'secondary'|'ghost'|'danger'; icon?:ReactNode }>) {
  return <button className={`btn btn-${variant} ${className}`} {...props}>{icon}{children}</button>;
}

export function Badge({ children, tone='neutral' }: PropsWithChildren<{ tone?:StatusTone }>) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Card({ children, className='' }: PropsWithChildren<{ className?:string }>) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function Kpi({ label, value, tone='neutral', hint }: { label:string; value:string; tone?:StatusTone; hint?:string }) {
  return <Card className="kpi-card"><span className={`kpi-accent tone-${tone}`} /><strong>{value}</strong><span>{label}</span>{hint && <small>{hint}</small>}</Card>;
}

export function EmptyState({ icon, title, text, action }: { icon:ReactNode; title:string; text:string; action?:ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{text}</p>{action}</div>;
}

export function Field({ label, children, hint }: PropsWithChildren<{ label:string; hint?:string }>) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function Modal({ title, children, onClose, footer }: PropsWithChildren<{ title:string; onClose:()=>void; footer?:ReactNode }>) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <header><h2>{title}</h2><button className="icon-btn" aria-label="Close" onClick={onClose}><X size={20}/></button></header>
      <div className="modal-body">{children}</div>{footer && <footer>{footer}</footer>}
    </div>
  </div>;
}

export function Toast({ message, tone='info', onClose }: { message:string; tone?:'info'|'success'|'danger'|'warning'; onClose:()=>void }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'danger' ? XCircle : tone === 'warning' ? AlertTriangle : Info;
  return <div className={`toast toast-${tone}`} role="status"><Icon size={18}/><span>{message}</span><button onClick={onClose} aria-label="Dismiss"><X size={16}/></button></div>;
}

export function Loading({ label='Loading' }: { label?:string }) {
  return <div className="loading"><LoaderCircle className="spin" size={24}/><span>{label}</span></div>;
}

export function SectionHeader({ eyebrow, title, description, action }: { eyebrow?:string; title:string; description?:string; action?:ReactNode }) {
  return <div className="section-header"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="section-actions">{action}</div>}</div>;
}

export function SkeletonTable() {
  return <Card><div className="skeleton skeleton-title"/><div className="skeleton"/><div className="skeleton"/><div className="skeleton"/></Card>;
}
