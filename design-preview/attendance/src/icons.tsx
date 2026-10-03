import React from 'react';
export function Icon({name}:{name:string}){
 const paths:Record<string,React.ReactNode>={
 home:<><path d="m3 10 9-7 9 7v10h-6v-7H9v7H3Z"/></>,
 attendance:<><rect x="4" y="4" width="16" height="17" rx="3"/><path d="M8 2v4m8-4v4M8 13l3 3 5-5"/></>,
 marks:<><path d="M5 20V11m7 9V4m7 16V8"/></>,
 calendar:<><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-9 3v4m-2-2h4"/></>,
 arrow:<path d="M5 12h14m-5-5 5 5-5 5"/>,
 chevron:<path d="m9 5 7 7-7 7"/>,
 down:<path d="m6 9 6 6 6-6"/>,
 close:<path d="m6 6 12 12M6 18 18 6"/>,
 info:<><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/></>,
 attention:<><circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4v.1"/></>,
 check:<path d="m5 12 4 4 10-10"/>,
 minus:<path d="M5 12h14"/>,plus:<path d="M5 12h14M12 5v14"/>,
 more:<><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></>
 };
 return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]??paths.info}</svg>;
}
