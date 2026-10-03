// Adapted from Rare UI FamilyDrawer, copyright (c) 2026 Swami Malode.
// https://rareui.com — retained license in LICENSE-Rare-UI.txt.
// v6 source preserved in provenance/. See README for centered-surface changes.
import {useCallback, useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import useMeasure from 'react-use-measure';
import {AnimatePresence, motion, useAnimationControls, useIsPresent, useReducedMotion} from 'motion/react';

type Measurement = {view:string;height:number};
type Props = {view:string;children:ReactNode;onReady:(view:string)=>void};
const ease = [0.26, 0.08, 0.25, 1] as const;

function MeasuredView({view,children,revealed,onMeasure,onReady}: Props & {
 revealed:boolean;onMeasure:(value:Measurement)=>void;
}) {
 const [ref,bounds] = useMeasure({offsetSize:true});
 const present = useIsPresent();
 const reduced = useReducedMotion();
 useLayoutEffect(()=>{
  if(bounds.height) onMeasure({view,height:bounds.height});
 },[bounds.height,view,onMeasure]);
 return <motion.div ref={ref} className="surface-content" data-content={view}
  inert={!present || !revealed} aria-hidden={!present || !revealed}
  initial={{opacity:0}} animate={{opacity:revealed?1:0}} exit={{opacity:0}}
  transition={{duration:reduced?0:0.12,ease}}
  onAnimationComplete={target=>{
   if(present && revealed && typeof target==='object' && target.opacity===1) onReady(view);
  }}>{children}</motion.div>;
}

export default function FamilySurface({view,children,onReady}:Props) {
 const reduced = useReducedMotion();
 const controls = useAnimationControls();
 const [measure,setMeasure] = useState<Measurement>({view:'',height:0});
 const [revealed,setRevealed] = useState('');
 const [available,setAvailable] = useState(window.visualViewport?.height ?? window.innerHeight);
 const previousHeight = useRef(0);
 const generation = useRef(0);
 const initial = useRef(true);
 const surfaceRef = useRef<HTMLElement>(null);
 const report = useCallback((next:Measurement)=>setMeasure(old=>
  old.view===next.view && old.height===next.height ? old : next),[]);
 useLayoutEffect(()=>{
  const viewport=window.visualViewport;
  const update=()=>{
   const height=viewport?.height ?? window.innerHeight;
   document.documentElement.style.setProperty('--viewport-height',`${height}px`);
   document.documentElement.style.setProperty('--viewport-top',`${viewport?.offsetTop ?? 0}px`);
   setAvailable(height);
  };
  update();
  viewport?.addEventListener('resize',update);
  viewport?.addEventListener('scroll',update);
  window.addEventListener('resize',update);
  return ()=>{
   viewport?.removeEventListener('resize',update);
   viewport?.removeEventListener('scroll',update);
   window.removeEventListener('resize',update);
  };
 },[]);
 useLayoutEffect(()=>{
  const ticket=++generation.current;
  if(measure.view!==view || !measure.height) return;
  // Reserve brand/safe-area clearance symmetrically in keyboard-height views.
  const target=Math.min(measure.height,Math.max(112,available-(available<580?112:32)));
  const difference=Math.abs(target-previousHeight.current);
  // Retain FamilyDrawer's measured-height/delta timing, without text scaling.
  const duration=reduced || initial.current ? 0 : Math.min(Math.max(difference/950,0.26),0.38);
  previousHeight.current=target;
  initial.current=false;
  controls.start({height:target,transition:{duration,ease}}).then(()=>{
   if(ticket===generation.current) setRevealed(view);
  });
  return ()=>{generation.current++;controls.stop();};
 },[measure,view,available,reduced,controls]);
 const ready = useCallback((key:string)=>{
  if(key===view) onReady(key);
 },[view,onReady]);
 return <div className="surface-anchor">
  <motion.section ref={surfaceRef} className="family-surface" aria-label="Sign in preview"
   data-testid="login-panel" data-step={view} data-state={view} data-ready={revealed===view} initial={{height:250}}
   animate={controls}>
   <div className="surface-scroll" tabIndex={-1}>
    <AnimatePresence mode="wait" initial={false}>
     <MeasuredView key={view} view={view} revealed={revealed===view}
      onMeasure={report} onReady={ready}>{children}</MeasuredView>
    </AnimatePresence>
   </div>
  </motion.section>
 </div>;
}
