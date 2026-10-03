// Synthetic records carried unchanged from the v4 study. Units are hours.
export type Course={name:string;code:string;p:number|null;t:number|null;previous?:{p:number;t:number}};
export const courses:Course[]=[
 {name:'Computer Networks',code:'21CSC302J',p:13,t:19,previous:{p:11,t:16}},
 {name:'Data Structures',code:'21CSC201J',p:18,t:22,previous:{p:17,t:21}},
 {name:'Operating Systems',code:'21CSC202J',p:20,t:22,previous:{p:19,t:21}},
 {name:'Discrete Mathematics',code:'21MAB204T',p:18,t:24,previous:{p:18,t:23}},
 // Prior snapshots above are synthetic, for the change-since-sync design preview.
 {name:'Professional Ethics',code:'21LEM202T',p:null,t:null}
];
export const TARGET=75;
export function attendance(p:number|null,t:number|null){
 if(p===null||t===null||t<=0)return null;
 return {percent:100*p/t,required:Math.max(0,3*t-4*p),canMiss:Math.max(0,Math.floor(4*p/3-t))};
}
export function changeSinceSync(c:Course){
 const current=attendance(c.p,c.t),before=c.previous?attendance(c.previous.p,c.previous.t):null;
 return current&&before?current.percent-before.percent:null;
}
export type PlanMode='Leave'|'Attend'|'OD';
export function project(c:Course,hours:number,mode:PlanMode){
 if(c.p===null||c.t===null||mode==='OD')return null;
 const p=c.p+(mode==='Attend'?hours:0),t=c.t+hours;
 return {p,t,...attendance(p,t)!};
}
