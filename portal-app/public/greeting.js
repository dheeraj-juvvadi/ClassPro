'use strict';
globalThis.anonGreeting = (fullName, date) => {
  const words = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  let name = words.length === 3 ? words[1] : words[0] || '';
  if (name === name.toUpperCase()) name = name.toLowerCase().replace(/(^|[-'])\p{L}/gu, letter => letter.toUpperCase());
  const hour = date.getHours();
  const greeting = hour < 5 || hour >= 22 ? 'It’s late' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return `${greeting}${name ? ', ' + name : ''}.`;
};
