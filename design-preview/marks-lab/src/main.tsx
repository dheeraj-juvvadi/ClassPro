import React, {useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {MotionConfig} from 'motion/react';
import {GraphSpec} from './registry/default/graph-spec/graph-spec';
import {marksCourses, type MarksCourse} from './marks-courses';
import {cn} from './lib/utils';
import './style.css';
import './lab.css';
import './cards.css';
import './ledger.css';
import './strips.css';
import './sizes.css';

const requestedVariant=new URLSearchParams(location.search).get('style');
const variant=['cards','ledger','strips'].includes(requestedVariant||'')?requestedVariant:'cards';
const requestedSize=new URLSearchParams(location.search).get('size');
const tileSize=['mini','compact','regular'].includes(requestedSize||'')?requestedSize:null;

type IconName = 'home'|'attendance'|'marks'|'info'|'clock'|'close'|'check'|'chevron'|'plus';
function Icon({name}:{name:IconName}){
  const paths:Record<IconName,React.ReactNode> = {
    home:<><path d="m3 10 9-7 9 7"/><path d="M5 9v12h5v-7h4v7h5V9"/></>,
    attendance:<><rect x="4" y="3" width="16" height="18" rx="4"/><path d="m8 12 3 3 5-6"/></>,
    marks:<><path d="M5 20V11m7 9V4m7 16V8"/></>,
    info:<><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.01"/></>,
    clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    close:<path d="m6 6 12 12M6 18 18 6"/>,
    check:<path d="m5 12 4 4L19 6"/>,
    chevron:<path d="m9 6 6 6-6 6"/>,
    plus:<path d="M12 5v14M5 12h14"/>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function Score({score,max}:{score:number|null,max:number}){
  return <span className={cn('score',score===null&&'score-pending',score===0&&'score-zero')}>
    {score===null?<span className="pending-word">Pending</span>:<strong>{score}</strong>}
    <span className="out-of"><span aria-hidden="true">/ </span><span className="sr-only">out of </span>{max}</span>
  </span>;
}

function Course({course}:{course:MarksCourse}){
  const released=course.assessments.filter(a=>a.score!==null);
  const total=released.reduce((sum,a)=>sum+a.score!,0);
  const maximum=released.reduce((sum,a)=>sum+a.max,0);
  return <section className="course" aria-labelledby={`course-${course.code}`} data-course={course.code}>
    <header className="course-header">
      <div className="course-identity"><h2 id={`course-${course.code}`}>{course.name}</h2><p className="course-code">{course.code}</p></div>
      <div className="course-total" aria-label={released.length?`Released total: ${total} out of ${maximum}`:'No marks released yet'}>
        {released.length?<Score score={total} max={maximum}/>:<span className="no-total">Pending</span>}
      </div>
    </header>
    <GraphSpec title={`${course.name}: all assessments`} corner="" className="assessments"
      rows={course.assessments.map(a=>({label:a.name,value:<span className="assessment-visual" data-pending={a.score===null}>
        <Score score={a.score} max={a.max}/>
        <span className="assessment-rail" aria-hidden="true" style={{'--score-progress':`${a.score===null?0:100*a.score/a.max}%`} as React.CSSProperties}/>
      </span>}))}/>
    <p className="course-status">{released.length} of {course.assessments.length} assessments released</p>
  </section>;
}

// The default records are copied unmodified. This opt-in fixture is only for QA.
const stress=new URLSearchParams(location.search).has('stress');
const courses:MarksCourse[]=stress?marksCourses.map((course,i)=>i===0?{
  ...course,name:'Computer Networks and Distributed Communication Systems',
  assessments:course.assessments.map((a,j)=>j===0?{...a,name:'Continuous assessment: network architecture and protocol implementation'}:j===1?{...a,name:'UnbrokenAssessmentLabelForNarrowScreenVerification'}:a),
}:course):marksCourses;

function App(){
  const dialog=useRef<HTMLDialogElement>(null);
  const scrollCurrentPage=(event:React.MouseEvent<HTMLAnchorElement>)=>{
    if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    if(event.currentTarget.pathname.replace(/\/+$/,'')!==location.pathname.replace(/\/+$/,''))return;
    event.preventDefault();
    window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  };
  return <MotionConfig reducedMotion="always"><div className="app" id="top" data-variant={tileSize?'strips':variant} data-size={tileSize}>
    <div className="floral" aria-hidden="true"/>
    <header className="app-header">
      <a className="brand" href="#top" aria-label="Anon, back to top"><img src="/assets/logo.svg" width="30" height="30" alt=""/><span>Anon</span></a>
      <button className="info-button" aria-label="Open tools" aria-haspopup="dialog" onClick={()=>dialog.current?.showModal()}><Icon name="plus"/></button>
    </header>
    <main>
      <header className="page-heading"><h1>Marks.</h1><p>Every assessment, in one place.</p></header>
      <nav className="style-switch" aria-label="Mockup style">
        {(tileSize?[['mini','32 · Mini'],['compact','44 · Compact'],['regular','52 · Relaxed']]:[['cards','A · Cards'],['ledger','B · Gradebook'],['strips','C · Score tiles']]).map(([value,label])=><a key={value} href={tileSize?`?style=strips&size=${value}`:`?style=${value}`} aria-current={(tileSize||variant)===value?'page':undefined}>{label}</a>)}
      </nav>
      <div className="course-list">{courses.map(course=><Course key={course.code} course={course}/>)}</div>
      <footer className="page-note"><Icon name="info"/><div><p>Pending isn’t zero.</p><p>Totals include released assessments only.</p></div></footer>
    </main>
    <nav className="bottom-nav" aria-label="Main navigation">
      {(['home','attendance','marks'] as const).map(name=><a key={name} href={`/${name}/`} className={cn(name==='marks'&&'active')} aria-current={name==='marks'?'page':undefined} onClick={scrollCurrentPage}>
        <span className="nav-icon"><Icon name={name}/></span><span>{name[0].toUpperCase()+name.slice(1)}</span>
      </a>)}
    </nav>
    <dialog ref={dialog} aria-labelledby="preview-title" onClick={e=>{if(e.target===dialog.current)dialog.current?.close();}}>
      <div className="dialog-top"><h2 id="preview-title">More from Anon</h2><button aria-label="Close preview information" onClick={()=>dialog.current?.close()}><Icon name="close"/></button></div>
      <nav className="preview-links" aria-label="More pages">
        <a href="/grades/"><span>Grade planning</span><Icon name="chevron"/></a>
        {(['schedule','calendar','settings'] as const).map(name=><a key={name} href={`/${name}/`}><span>{name[0].toUpperCase()+name.slice(1)}</span><Icon name="chevron"/></a>)}
      </nav>
      <h3>About this preview</h3><p>Sample records. No account connected.</p>
      <p className="credits">Assessment rows adapt <a href="https://github.com/keshav-exe/mdxcn/tree/2928126ba146ebbae9c2351deca27d27bb40e744/registry/default/graph-spec" target="_blank" rel="noreferrer">GraphSpec by Keshav Bagaade</a>, shared under the <a href="/marks/LICENSE.mdxcn" target="_blank" rel="noreferrer">MIT license</a>.</p>
      <button className="dialog-done" onClick={()=>dialog.current?.close()}>Back to marks</button>
    </dialog>
  </div></MotionConfig>;
}
createRoot(document.getElementById('root')!).render(<App/>);
