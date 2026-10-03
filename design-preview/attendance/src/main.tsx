import React,{useState,useRef,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {MotionConfig} from 'motion/react';
import {GraphBullet} from './registry/default/graph-bullet/graph-bullet';
import {courses,attendance,changeSinceSync} from './attendance-data';
import {Icon} from './icons';
import {Planner} from './planner';
import './style.css';

function CourseRows(){
 const [tip,setTip]=useState<string|null>(null);
 return <div className="course-list">{courses.map(c=>{
  const a=attendance(c.p,c.t),delta=changeSinceSync(c);
  return <article className={`course ${a?.required?'needs-attention':''} ${!a?'unknown':''}`} key={c.code} aria-label={c.name}>
   <h3>{c.name}</h3><div className="margin-row" aria-label={!a?"No attendance recorded":a.required?`${a.required} hours required for 75 percent`:`${a.canMiss} hours available above 75 percent`}><strong className="allowance-value">{a?<>{a.required?'−':''}{a.required||a.canMiss}<small>h</small></>:'—'}</strong></div>
   <p className="recorded">{a?<><span className="recorded-hours"><b>{c.p} / {c.t}h</b> attended</span><span className="recorded-rate"><span className="record-divider">·</span><b className="recorded-percent">{a.percent.toFixed(1)}%</b>{delta!==null&&<span className={`sync-delta ${delta<0?'negative':'positive'}`} aria-label={`${Math.abs(delta).toFixed(1)} percentage points ${delta<0?'decrease':'increase'} since previous sync`}>{delta<0?'↘ −':'↗ +'}{Math.abs(delta).toFixed(1)}<small>pp</small></span>}</span></>:'No attendance recorded'}</p>
   {a?<div className="meter-hit" tabIndex={0} role="img" aria-label={`${c.name}: ${c.p} of ${c.t} hours attended, ${a.percent.toFixed(1)} percent. Target 75 percent.`} onPointerEnter={()=>setTip(c.code)} onPointerLeave={()=>setTip(null)} onFocus={()=>setTip(c.code)} onBlur={()=>setTip(null)} onKeyDown={e=>{if(e.key==='Escape')setTip(null);}}>
    <GraphBullet title="" corner="" className="course-meter" ticks={100} glyphs={['·','─','─','─','━']} items={[{label:c.name,value:a.percent,target:75,max:100,display:`${a.percent.toFixed(1)}%`}]}/>
    {tip===c.code&&<span className="meter-tooltip" role="tooltip">{c.p} of {c.t}h · {a.percent.toFixed(1)}% · target 75%</span>}
   </div>:<div className="unknown-line" aria-hidden="true"/>}
  </article>;
 })}</div>;
}
function App(){
 const [planner,setPlanner]=useState(false),[info,setInfo]=useState(false);
 const about=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(info)about.current?.showModal();},[info]);
 return <MotionConfig reducedMotion="always"><div className="app">
  <header className="masthead"><div className="flowers" aria-hidden="true"/><div className="brand-row"><span className="brand"><img src="/assets/logo.svg" alt=""/>Anon</span><button className="icon-button" aria-label="Open tools" aria-haspopup="dialog" aria-expanded={info} aria-controls="about-preview" onClick={()=>setInfo(true)}><Icon name="plus"/></button></div><div className="page-heading"><h1>Attendance</h1><p><Icon name="attention"/>1 course below 75%</p></div></header>
  <main>
   <button className="planner-entry" onClick={()=>setPlanner(true)}><span className="planner-icon"><Icon name="calendar"/></span><span><strong>Plan your attendance</strong><small>Leave, Attend or OD</small></span><Icon name="chevron"/></button>
   <section className="courses" aria-labelledby="courses-title"><div className="section-head"><h2 id="courses-title">Your courses</h2><span className="target-key"><i aria-hidden="true"/>75% target</span></div><CourseRows/></section>
   <div className="footnotes"><p>Change since previous sync, in percentage points (pp).<br/>Sample records & history · bars use a 0–100% scale.</p><details className="data-details"><summary>Recorded data & calculation<Icon name="down"/></summary><table><caption>Recorded attendance in hours</caption><thead><tr><th>Course</th><th>Attended / held</th><th>%</th></tr></thead><tbody>{courses.map(c=><tr key={c.code}><th scope="row">{c.name}</th><td>{c.p===null?'Unknown':`${c.p} / ${c.t}`}</td><td>{c.p===null||!c.t?'—':(100*c.p/c.t).toFixed(1)}</td></tr>)}</tbody></table><p>Attendance = attended ÷ held. Each course is checked separately. Unknown data is never counted as zero.</p></details></div>
  </main>
  <nav className="bottom-nav" aria-label="Main navigation">{['Home','Attendance','Marks'].map(n=><a key={n} href={`/${n.toLowerCase()}/`} aria-current={n==='Attendance'?'page':undefined}><span className="nav-icon"><Icon name={n.toLowerCase()}/></span><span>{n}</span></a>)}<div className="gesture" aria-hidden="true"/></nav>
  {planner&&<Planner onClose={()=>setPlanner(false)}/>}
  <dialog ref={about} id="about-preview" className="about" aria-labelledby="about-title" onClose={()=>setInfo(false)} onClick={e=>{if(e.target===e.currentTarget)about.current?.close();}}>
   <h2 id="about-title">More from Anon</h2>
   <nav className="about-menu" aria-label="More pages"><a href="/grades/"><span>Grade planning</span><Icon name="chevron"/></a>{['Schedule','Calendar','Settings'].map(n=><a key={n} href={`/${n.toLowerCase()}/`}><span>{n}</span><Icon name="chevron"/></a>)}</nav>
   <p>Synthetic records only. No university connection.</p><p>Built with the actual MIT-licensed mdxcn GraphBullet component. The preview never changes recorded attendance.</p><button className="primary-button" onClick={()=>about.current?.close()}>Got it</button>
  </dialog>
 </div></MotionConfig>;
}
createRoot(document.getElementById('root')!).render(<App/>);
