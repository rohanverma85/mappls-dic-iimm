export function Logo({ compact=false, inverse=false }: { compact?:boolean; inverse?:boolean }) {
  return <div className={`brand ${compact ? 'brand-compact':''} ${inverse ? 'brand-inverse':''}`}>
    <span className="brand-mark">DI</span>
    {!compact && <span><b>DIGITAL INDIA</b><strong>IIMM Platform</strong></span>}
  </div>;
}
