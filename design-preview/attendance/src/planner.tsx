import React,{useState,useEffect,useRef} from 'react';
import {courses,attendance,project,type PlanMode} from './attendance-data';
import {Icon} from './icons';
export function Planner({onClose}:{onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);
 const [course,setCourse]=useState(1),[mode,setMode]=useState<PlanMode>('Leave'),[hours,setHours]=useState(2);
 const c=courses[course],a=attendance(c.p,c.t),next=project(c,hours,mode);
 useEffect(()=>{ref.current?.showModal();const before=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=before;};},[]);
 return <dialog className="planner-sheet" ref={ref} aria-labelledby="plan-title" onClose={onClose} onClick={e=>{if(e.target===e.currentTarget)ref.current?.close();}}>
  <div className="sheet-body"><div className="handle" aria-hidden="true"/>
   <header className="sheet-header"><div><h2 id="plan-title">Plan your attendance</h2><p>Preview only · not saved</p></div><button className="icon-button" aria-label="Close planner" onClick={()=>ref.current?.close()}><Icon name="close"/></button></header>
   <div className="segmented" role="group" aria-label="Attendance action">{(['Leave','Attend','OD'] as PlanMode[]).map(m=><button key={m} aria-pressed={mode===m} onClick={()=>setMode(m)}>{m===mode&&<Icon name="check"/>}{m}</button>)}</div>
   <label className="field-label" htmlFor="plan-course">Course</label><div className="select-wrap"><select id="plan-course" value={course} onChange={e=>setCourse(Number(e.target.value))}>{courses.map((c,i)=><option key={c.code} value={i}>{c.name}</option>)}</select><Icon name="down"/></div>
   <div className="hours-row"><div><h3>Upcoming hours</h3><p>{mode==='OD'?'Hours on duty':mode==='Leave'?'Hours you will miss':'Hours you will attend'}</p></div><div className="stepper"><button aria-label="Decrease hours" disabled={hours<=1} onClick={()=>setHours(h=>h-1)}><Icon name="minus"/></button><output aria-label="Upcoming hours">{hours}<small>h</small></output><button aria-label="Increase hours" disabled={hours>=24} onClick={()=>setHours(h=>h+1)}><Icon name="plus"/></button></div></div>
   <section className="projection" aria-live="polite" aria-label="Attendance preview">
   {a&&next?<><div className="comparison"><div><p>Recorded</p><strong>{a.percent.toFixed(1)}<small>%</small></strong><span>{c.p} / {c.t}h</span></div><Icon name="arrow"/><div><p>After {mode.toLowerCase()}</p><strong>{next.percent.toFixed(1)}<small>%</small></strong><span>{next.p} / {next.t}h</span></div></div><p className={`projection-result ${next.required?'below':''}`}><Icon name={next.required?'attention':next.canMiss?'check':'minus'}/>{next.required?`Then attend ${next.required}h to reach 75%`:next.canMiss?`You could still miss ${next.canMiss}h`:'At 75% · no hours to spare'}</p></>:<div className="projection-empty"><Icon name="info"/><h3>{!a?'No recorded baseline':'OD impact is unknown'}</h3><p>{!a?'Professional Ethics has no attendance records. A percentage cannot be calculated.':'Your university’s OD rules are not available. These hours are not assumed present, absent or excluded.'}</p>{a&&<p className="baseline">Recorded: {c.p} / {c.t}h · {a.percent.toFixed(1)}%</p>}</div>}
   </section>
   <p className="sheet-note">{mode==='OD'?'This is not an OD request. Approval and attendance credit must be confirmed with your university.':'Assumes these hours are added to classes held. This is an estimate, not a timetable or leave request.'}</p>
   <button className="primary-button" onClick={()=>ref.current?.close()}>Close preview</button><p className="isolated-note"><Icon name="info"/>Your recorded attendance stays unchanged.</p>
  </div>
 </dialog>;
}
