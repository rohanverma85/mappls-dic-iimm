import { useEffect, useState } from 'react';
import type { Session } from '../shared/types';
import { getStoredSession, storeSession } from './api';
import Shell, { type AppPage } from './components/Shell';
import Login from './pages/Login';
import Marketing from './pages/Marketing';
import Workspace from './pages/Workspace';

function routeFromHash() {
  const value = window.location.hash.replace(/^#\/?/, '');
  if (!value) return { view:'marketing' as const, page:'dashboard' as AppPage };
  if (value === 'login') return { view:'login' as const, page:'dashboard' as AppPage };
  if (value.startsWith('app/')) return { view:'app' as const, page:(value.split('/')[1] || 'dashboard') as AppPage };
  return { view:'marketing' as const, page:'dashboard' as AppPage };
}

export default function App() {
  const [route,setRoute] = useState(routeFromHash);
  const [session,setSession] = useState<Session|null>(getStoredSession);
  useEffect(()=>{const handler=()=>setRoute(routeFromHash());window.addEventListener('hashchange',handler);return()=>window.removeEventListener('hashchange',handler);},[]);
  function go(hash:string){window.location.hash=hash;}
  function navigate(page:AppPage){go(`/app/${page}`);}
  function loggedIn(next:Session){setSession(next);navigate('dashboard');}
  function logout(){storeSession(null);setSession(null);go('/login');}
  if(route.view==='marketing')return <Marketing onLaunch={()=>go('/login')}/>;
  if(route.view==='login'||!session)return <Login onBack={()=>go('')} onLogin={loggedIn}/>;
  return <Shell session={session} page={route.page} onNavigate={navigate} onLogout={logout}><Workspace session={session} page={route.page} navigate={navigate}/></Shell>;
}
