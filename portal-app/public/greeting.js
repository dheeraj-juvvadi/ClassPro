'use strict';

globalThis.anonGreetings = (() => {
  // Bundled with the app; choosing greetings never calls a server.
  const common = [
    'You again?', 'Back already?', 'Still here?', 'Hello again.', 'Welcome back.',
    'Back again?', 'Oh, hello.', 'Well, hello.', 'Hey there.', 'There’s {name}.',
    'Just checking?', 'Checking in?', 'Quick look?', 'Another look?', 'One more?',
    'You returned.', 'Still looking?', 'Looking around?', 'Passing through?', 'Quick visit?',
    'Staying awhile?', 'Leaving already?', 'Missed something?', 'Forgot something?',
    'Something new?', 'What’s new?', 'We’re back.', 'Here again.', 'Here’s {name}.',
    'Back, {name}?', 'Another visit?', 'Welcome, {name}.', 'Hello, {name}.', 'Hey, {name}.',
  ];
  const seasonal = [
    ['Morning already?', 'You awake?', 'Early start?', 'Up already?', 'Wide awake?',
      'Afternoon already?', 'Between classes?', 'Still going?'],
    ['Long day?', 'Evening already?', 'Winding down?', 'Day done?'],
    ['Still awake?', 'Late visit?', 'Up late?', 'Not asleep?'],
  ];
  function name(fullName) {
    const words = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    let value = words.length === 3 ? words[1] : words[0] || '';
    if (value === value.toUpperCase()) value = value.toLowerCase().replace(/(^|[-'])\p{L}/gu, letter => letter.toUpperCase());
    return value;
  }
  function select(profile = {}) {
    profile = profile || {};
    const displayName = name(profile.name);
    const identity = String(profile.regNo || profile.name || 'anon').trim().toLowerCase();
    let seed = 2166136261;
    for (const char of identity) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
    const chosen = [];
    for (let period = 0; period < 3; period++) {
      // The daytime extra is neutral so it also reads naturally after noon.
      const options = [...common, ...(period ? seasonal[period] : [])]
        .filter(line => !chosen.includes(line) && (displayName || !line.includes('{name}')));
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      chosen.push(options[seed % options.length]);
    }
    return chosen.map(line => line.replace('{name}', displayName));
  }
  function show(fullName, date, extras = []) {
    const hour = date.getHours();
    const period = hour < 5 || hour >= 22 ? 2 : hour < 17 ? 0 : 1;
    const firstHour = hour === [5, 17, 22][period];
    if (!firstHour && extras.length === 3) return extras[period];
    const displayName = name(fullName);
    return `${['Good morning', 'Good evening', 'Goodnight'][period]}${displayName ? ', ' + displayName : ''}.`;
  }
  return { select, show };
})();
globalThis.anonGreeting = anonGreetings.show;
