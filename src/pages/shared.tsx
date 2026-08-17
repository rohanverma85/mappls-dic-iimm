import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

export function useData<T>(path:string, initial:T) {
  const [data,setData] = useState<T>(initial);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const load = useCallback(async()=>{setLoading(true);setError('');try{setData(await api<T>(path));}catch(e){setError(e instanceof Error?e.message:'Unable to load data');}finally{setLoading(false);}},[path]);
  useEffect(()=>{void load();},[load]);
  return {data,setData,loading,error,reload:load};
}

export function toneFor(status:string) {
  const value=status.toLowerCase();
  if (value.includes('approved')||value.includes('resolved')||value.includes('complete')||value.includes('present')||value==='live'||value.includes('verified')) return 'success' as const;
  if (value.includes('reject')||value.includes('overdue')||value.includes('critical')||value.includes('breach')||value.includes('out of')) return 'danger' as const;
  if (value.includes('pending')||value.includes('review')||value.includes('submitted')||value.includes('progress')||value.includes('scheduled')||value.includes('attention')||value.includes('provisioning')) return 'warning' as const;
  if (value.includes('assign')||value.includes('accept')||value.includes('fair')) return 'info' as const;
  return 'neutral' as const;
}

export function formatDate(value:string) {
  const date=new Date(value); return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',year:'numeric'}).format(date);
}

export function formatMoney(value:number) { return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(value); }

export function ErrorBanner({message}:{message:string}) { return message?<div className="error-banner">{message}</div>:null; }
