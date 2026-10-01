"use client";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '@/components/ui/table';
import type {ReactNode} from 'react';
export function Choice({label,value,items,onChange}:{label:string,value:string,items:{value:string,label:string}[],onChange:(v:string)=>void}){return <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue/></SelectTrigger><SelectContent position="popper">{items.map(i=><SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent></Select>}
export function DataTable({headers,rows}:{headers:string[],rows:ReactNode[][]}){return <Table><TableHeader><TableRow>{headers.map(h=><TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map((r,i)=><TableRow key={i}>{r.map((c,j)=><TableCell key={j}>{c}</TableCell>)}</TableRow>)}</TableBody></Table>}
export function download(filename:string,text:string,type='text/csv'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
export const money=(n:number,c:string)=>new Intl.NumberFormat('en-CA',{style:'currency',currency:c,currencyDisplay:'code',minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
export const shortMoney=(n:number,c='CAD')=>new Intl.NumberFormat('en-CA',{style:'currency',currency:c,currencyDisplay:'narrowSymbol',maximumFractionDigits:0}).format(n);
export const dateLabel=(s:string)=>new Date(s+'T12:00:00Z').toLocaleDateString('en-CA',{month:'short',day:'numeric',timeZone:'UTC'});

