export type Assessment={name:string;score:number|null;max:number};
export type MarksCourse={name:string;code:string;assessments:Assessment[];internalMax?:number};
// Synthetic design fixtures. Assessment names and counts are not a fixed schema.
export const marksCourses:MarksCourse[]=[
 {name:'Computer Networks',code:'21CSC302J',internalMax:60,assessments:[{name:'FT-1',score:16,max:25},{name:'FT-2',score:16,max:25},{name:'Quiz',score:7,max:10}]},
 {name:'Data Structures',code:'21CSC201J',internalMax:60,assessments:[{name:'FT-1',score:21,max:25},{name:'FT-2',score:22,max:25},{name:'Assignment',score:null,max:10}]},
 {name:'Operating Systems Lab',code:'21CSC202P',assessments:[{name:'Practical',score:18,max:20},{name:'Lab record',score:9,max:10},{name:'Viva',score:8,max:10}]},
 {name:'Discrete Mathematics',code:'21MAB204T',internalMax:60,assessments:[{name:'Test 1',score:17,max:20},{name:'Test 2',score:18,max:20},{name:'Problem set',score:8,max:10},{name:'Quiz',score:0,max:10}]},
 {name:'Professional Ethics',code:'21LEM202T',assessments:[{name:'Presentation',score:null,max:20},{name:'Project',score:null,max:30}]}
];
