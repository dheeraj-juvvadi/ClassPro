import {useCallback,useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MotionConfig} from 'motion/react';
import FamilySurface from './family-surface';
import './study.css';

type Stage='email'|'password'|'signing'|'result';
function Secret({label,id,value,error,onChange}:{label:string;id:string;value:string;error:string;onChange:(v:string)=>void}) {
 const [shown,setShown]=useState(false);
 return <div className="secret-control"><div className="filled-field secret-field">
  <label htmlFor={id}>{label}</label>
  <input id={id} name={id} type={shown?'text':'password'} value={value}
   autoComplete="current-password" autoCapitalize="none" spellCheck={false}
   required aria-invalid={Boolean(error)} onChange={e=>onChange(e.target.value)}
   aria-describedby={`password-hint${error?` ${id}-error`:''}`}/>
  <button type="button" className="reveal" aria-label={`${shown?'Hide':'Show'} ${label.toLowerCase()}`}
   aria-controls={id} aria-pressed={shown} onClick={()=>setShown(!shown)}>{shown?'Hide':'Show'}</button>
 </div><p id={`${id}-error`} aria-live="polite" className="field-error">{error}</p></div>;
}
function Arrow(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>}
function App(){
 const [stage,setStage]=useState<Stage>('email');
 const [ready,setReady]=useState('');
 const [email,setEmail]=useState('');
 const [academia,setAcademia]=useState('');
 const [portal,setPortal]=useState('');
 const [remember,setRemember]=useState(true);
 const [errors,setErrors]=useState({academia:'',portal:''});
 const focused=useRef('');
 const firstEmail=useRef(true);
 const currentStage=useRef<Stage>('email');
 const go=useCallback((next:Stage)=>{
  currentStage.current=next;focused.current='';setReady('');setStage(next);setErrors({academia:'',portal:''});
 },[]);
 const onReady=useCallback((key:string)=>{
  if(currentStage.current!==key || focused.current===key) return;
  focused.current=key;setReady(key);
  // Initial email has no autofocus, avoiding an unsolicited mobile keyboard.
  if(key==='email' && firstEmail.current){firstEmail.current=false;return;}
  const selector=key==='email'?'#email':key==='password'?'#academia':'[data-content="'+key+'"] h2';
  document.querySelector<HTMLElement>(selector)?.focus({preventScroll:true});
 },[]);
 useEffect(()=>{
  if(ready!==stage || stage!=='signing') return;
  const id=window.setTimeout(()=>go('result'),900);
  return ()=>window.clearTimeout(id);
 },[stage,ready,go]);
 const busy=stage==='signing';
 const content=stage==='email'?<>
  <header className="surface-heading"><h2>Sign in.</h2><p>Start with your SRM email.</p></header>
  <form onSubmit={e=>{e.preventDefault();if(currentStage.current==='email') go('password')}}>
   <div className="filled-field email-field">
    <label htmlFor="email">Email address</label>
    <input id="email" name="email" type="email" inputMode="email" autoComplete="username"
     autoCapitalize="none" spellCheck={false} required value={email}
     placeholder="you@srmist.edu.in" onChange={e=>setEmail(e.target.value)}/>
   </div>
   <button className="primary" type="submit">Continue<Arrow/></button>
  </form>
  <p className="preview-note">Preview only. Nothing is sent or saved.</p>
 </>:stage==='password'?<>
  <header className="surface-heading"><h2>Both passwords.</h2><p id="password-hint">Enter both your Academia and Student Portal passwords to use the complete app.</p></header>
  <div className="account-row"><span>{email}</span><button type="button" className="text-button" onClick={()=>go('email')}>Change</button></div>
  <form noValidate onSubmit={e=>{
   e.preventDefault();if(currentStage.current!=='password') return;
   const missing={academia:academia===''?'Enter your Academia password.':'',portal:portal===''?'Enter your Student Portal password.':''};
   if(missing.academia || missing.portal){
    setErrors(missing);document.getElementById(missing.academia?'academia':'portal')?.focus({preventScroll:true});return;
   }
   go('signing');
  }}>
   <Secret label="Academia password" id="academia" value={academia} error={errors.academia}
    onChange={value=>{setAcademia(value);setErrors(old=>({...old,academia:''}))}}/>
   <Secret label="Student Portal password" id="portal" value={portal} error={errors.portal}
    onChange={value=>{setPortal(value);setErrors(old=>({...old,portal:''}))}}/>
   <label className="remember"><input type="checkbox" name="remember" checked={remember}
    onChange={e=>setRemember(e.target.checked)}/><span>Remember for 7 days</span></label>
   <button className="primary" type="submit">Sign in<Arrow/></button>
  </form>
  <p className="preview-note">Preview only. Nothing is sent or saved.</p>
 </>:busy?<div className="busy-content" aria-busy="true">
  <div className="busy-line"><span className="spinner" aria-hidden="true"/><h2 tabIndex={-1}>Signing in…</h2></div>
  <p>Preview only. No connection is made.</p>
  <button type="button" className="text-button cancel" onClick={()=>go('password')}>Cancel</button>
 </div>:<div className="result-content">
  <div className="result-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6 12 4 4 8-8"/></svg></div>
  <h2 tabIndex={-1}>Preview complete.</h2>
  <p>No credentials sent.<br/>This preview does not sign you in.</p>
  <a className="primary" href="/home/">Open home preview<Arrow/></a>
 </div>;
 return <MotionConfig reducedMotion="user">
  <div className="artwork" aria-hidden="true"/>
  <header className="brand"><img src="/assets/logo.svg" alt=""/>Anon</header>
  <main><FamilySurface view={stage} onReady={onReady}>{content}</FamilySurface></main>
  <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{stage==='signing'?'Signing in. Preview only.':stage==='result'?'Preview complete. No credentials sent.':''}</div>
 </MotionConfig>;
}
createRoot(document.getElementById('root')!).render(<App/>);
